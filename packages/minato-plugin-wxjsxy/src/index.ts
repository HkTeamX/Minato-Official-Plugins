import { Cron } from '@atri-bot/lib-cron'
import { Api } from './api'
import { BasePlugin, type CommandCallback } from '@atri-bot/core'
import { Command } from 'commander'
import dayjs from 'dayjs'
import { Structs } from 'node-napcat-ts'
import { CronExpressionParser } from 'cron-parser'

export interface WxjsxyAccount {
  username: string
  password: string
}

export interface WxjsxyCron {
  cron: string
  day: number
}

export interface WxjsxyPluginConfig {
  accounts: Record<number, WxjsxyAccount>
  crons: Record<number, WxjsxyCron>
}

export interface WxjsxyCommandContext {
  params: {
    action: '添加账号' | '请假' | '签到情况'
  }
}

export interface WxjsxyAddAccountCommandContext {
  params: {
    username: string
    password: string
  }
}

export interface WxjsxyProcessCommandContext {
  params: {
    day: string
  }
}

export interface WxjsxyAddCronCommandContext {
  params: {
    cron: string
    day: string
  }
}

export class Plugin extends BasePlugin<WxjsxyPluginConfig> {
  defaultConfig: WxjsxyPluginConfig = {
    accounts: {},
    crons: {},
  }

  api = new Api({
    ...this.atri.config,
    createAxios: {
      withCredentials: true,
      maxRedirects: 0, // 某些网站跳转后不再返回 set-cookie，可以视情况禁用自动重定向
      validateStatus: (s) => s === 302 || s === 200, // 允许 302
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'sec-ch-ua-platform': '"Windows"',
      },
    },
  })

  cron = new Cron(this.atri.config)

  async load() {
    if (Array.isArray(this.config.accounts)) this.config.accounts = {}
    this.syncCronJobs()

    this.regCommandEvent({
      commandName: 'wxjsxy添加账号',
      commander: new Command()
        .description('钉钉请假添加账号')
        .requiredOption('-u, --username <username>', '账号')
        .requiredOption('-p, --password <password>', '密码'),
      callback: this.addAccount.bind(this),
    })

    this.regCommandEvent({
      commandName: 'wxjsxy删除账号',
      commander: new Command().description('钉钉请假删除账号'),
      callback: this.removeAccount.bind(this),
    })

    this.regCommandEvent({
      commandName: 'wxjsxy请假',
      commander: new Command()
        .description('钉钉请假')
        .option('-d, --day <day>', '请假偏移天数, 默认为0天, 表示当天', '0'),
      callback: this.process.bind(this),
    })

    this.regCommandEvent({
      commandName: 'wxjsxy请假情况',
      commander: new Command().description('钉钉请假情况'),
      callback: this.processList.bind(this),
    })

    this.regCommandEvent({
      commandName: 'wxjsxy定时请假',
      commander: new Command()
        .description('钉钉定时请假')
        .requiredOption('-c, --cron <cron>', 'cron表达式')
        .option('-d, --day <day>', '请假偏移天数, 默认为0天, 表示当天', '0'),
      callback: this.addCron.bind(this),
    })

    this.regCommandEvent({
      commandName: 'wxjsxy删除定时请假',
      commander: new Command().description('钉钉删除定时请假'),
      callback: this.removeCron.bind(this),
    })
  }

  unload() {
    this.clearCronJobs()
  }

  async addAccount({ context, params }: CommandCallback<WxjsxyAddAccountCommandContext>) {
    const userId = context.user_id

    if (this.config.accounts[userId]) {
      await this.bot.sendMsg(context, [Structs.text('账号已存在，无需重复添加')])
      return
    }

    // 尝试登录
    try {
      const loginRes = await this.api.loginToCas(params.username, params.password)

      await this.bot.sendMsg(context, [
        Structs.text(`登录成功, 返回信息: \n ${JSON.stringify(loginRes.data)}`),
      ])

      this.config.accounts[userId] = {
        username: params.username,
        password: params.password,
      }

      this.saveConfig()
    } catch (error) {
      await this.bot.sendMsg(context, [
        Structs.text(`登录失败，请检查账号密码是否正确, 错误日志: ${error}`),
      ])

      return
    }
  }

  async removeAccount({ context }: CommandCallback) {
    const userId = context.user_id

    if (!this.config.accounts[userId]) {
      await this.bot.sendMsg(context, [Structs.text('账号不存在，无法删除')])
      return
    }

    delete this.config.accounts[userId]
    await this.bot.sendMsg(context, [Structs.text('账号删除成功')])
  }

  async process({ context, params }: CommandCallback<WxjsxyProcessCommandContext>) {
    return this._process(context, params)
  }

  async _process(
    context: Parameters<typeof this.bot.sendMsg>[0],
    params: WxjsxyProcessCommandContext['params'],
  ) {
    const userId = context.user_id!
    const account = this.config.accounts[userId]

    if (!account) {
      await this.bot.sendMsg(context, [
        Structs.text('请先添加账号，使用命令：wxjsxy添加账号 -u <用户名> -p <密码>'),
      ])
      return
    }

    // 尝试登录
    try {
      const loginRes = await this.api.loginToCas(account.username, account.password)
      const loginTokenRes = await this.api.getCasLoginToken(loginRes.data.tgt)
      const casCookie = await this.api.getDyCookie(loginTokenRes.data)
      const dyTokenRes = await this.api.getDyToken(casCookie)
      const dyAction = await this.api.setDyProcess(
        dyTokenRes.data.token,
        dayjs().hour(6).minute(30).add(parseInt(params.day), 'day').format('YYYY-MM-DD HH:mm'),
        dayjs().hour(20).minute(50).add(parseInt(params.day), 'day').format('YYYY-MM-DD HH:mm'),
        '是',
        '是',
        '事假',
        '集训',
      )
      await this.bot.sendMsg(context, [
        Structs.text(`请假成功, 返回信息: \n ${JSON.stringify(dyAction.data)}`),
      ])
    } catch (error) {
      await this.bot.sendMsg(context, [Structs.text(`操作失败，错误日志: ${error}`)])
      return
    }
  }

  async processList({ context }: CommandCallback) {
    const userId = context.user_id
    const account = this.config.accounts[userId]

    if (!account) {
      await this.bot.sendMsg(context, [
        Structs.text('请先添加账号，使用命令：wxjsxy添加账号 -u <用户名> -p <密码>'),
      ])
      return
    }

    // 尝试登录
    try {
      const loginRes = await this.api.loginToCas(account.username, account.password)
      const loginTokenRes = await this.api.getCasLoginToken(loginRes.data.tgt)
      const casCookie = await this.api.getDyCookie(loginTokenRes.data)
      const dyTokenRes = await this.api.getDyToken(casCookie)
      const dyProcessList = await this.api.getDyProcessList(dyTokenRes.data.token)
      await this.bot.sendMsg(context, [
        Structs.text(`请假情况:\n`),
        Structs.text(
          dyProcessList.data.rows
            .map(
              (item) =>
                `- 申请时间: ${item.processStartTime}\n   审核状态: ${item.approvaState}\n   开始时间: ${item.start_time}\n   结束时间: ${item.end_time}\n`,
            )
            .join(''),
        ),
      ])
    } catch (error) {
      await this.bot.sendMsg(context, [Structs.text(`操作失败，错误日志: ${error}`)])
      return
    }
  }

  isValidCron(cron: string): boolean {
    try {
      CronExpressionParser.parse(cron)
      return true
    } catch {
      return false
    }
  }

  async addCron({ context, params }: CommandCallback<WxjsxyAddCronCommandContext>) {
    if (this.config.accounts[context.user_id] === undefined) {
      await this.bot.sendMsg(context, [
        Structs.text('请先添加账号，使用命令：wxjsxy添加账号 -u <用户名> -p <密码>'),
      ])
      return
    }

    if (this.config.crons[context.user_id]) {
      await this.bot.sendMsg(context, [
        Structs.text('已存在定时任务，如需修改请先删除原有定时任务'),
      ])
      return
    }

    if (!this.isValidCron(params.cron)) {
      await this.bot.sendMsg(context, [Structs.text('cron表达式无效，请检查后重新输入')])
      return
    }

    this.config.crons[context.user_id] = {
      cron: params.cron,
      day: parseInt(params.day),
    }
    this.saveConfig()
    this.syncCronJobs()

    await this.bot.sendMsg(context, [Structs.text('定时请假任务添加成功')])
  }

  async removeCron({ context }: CommandCallback) {
    if (!this.config.crons[context.user_id]) {
      await this.bot.sendMsg(context, [Structs.text('定时任务不存在，无法删除')])
      return
    }

    delete this.config.crons[context.user_id]
    this.saveConfig()
    this.syncCronJobs()
    await this.bot.sendMsg(context, [Structs.text('定时请假任务删除成功')])
  }

  syncCronJobs() {
    this.clearCronJobs()

    Object.entries(this.config.crons).forEach(([userId, cronConfig]) => {
      this.cron.add({
        name: `wxjsxy-${userId}`,
        cronTime: cronConfig.cron,
        onTick: async () => {
          await this._process(
            { message_type: 'private', user_id: parseInt(userId) },
            { day: cronConfig.day.toString() },
          )
        },
        start: true,
      })
    })
  }

  clearCronJobs() {
    Object.entries(this.cron.cronJobs)
      .filter(([name, _]) => name.startsWith('wxjsxy-'))
      .forEach(([, job]) => job.stop())
  }
}
