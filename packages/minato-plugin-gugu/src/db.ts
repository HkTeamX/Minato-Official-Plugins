import { DataTypes, Model, type Optional, type Sequelize } from 'sequelize'

export interface PigeonsAttributes {
  user_id: number
  pigeon_num: number
  created_at?: Date
  updated_at?: Date
}

export type PigeonsCreationAttributes = Optional<PigeonsAttributes, 'created_at' | 'updated_at'>

export class Pigeons
  extends Model<PigeonsAttributes, PigeonsCreationAttributes>
  implements PigeonsAttributes
{
  declare user_id: number
  declare pigeon_num: number

  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export interface PigeonHistoriesAttributes {
  id: number
  user_id: number
  operation: number
  prev_num: number
  current_num: number
  reason: string

  created_at?: Date
  updated_at?: Date
}

export type PigeonHistoriesCreationAttributes = Optional<
  PigeonHistoriesAttributes,
  'id' | 'created_at' | 'updated_at'
>

export class PigeonHistories
  extends Model<PigeonHistoriesAttributes, PigeonHistoriesCreationAttributes>
  implements PigeonHistoriesAttributes
{
  declare id: number
  declare user_id: number
  declare operation: number
  declare prev_num: number
  declare current_num: number
  declare reason: string

  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export const initDb = async (sequelize: Sequelize) => {
  Pigeons.init(
    {
      user_id: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        primaryKey: true,
      },
      pigeon_num: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      tableName: 'pigeons',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  )

  PigeonHistories.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      operation: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      prev_num: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      current_num: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'pigeon_histories',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  )

  await sequelize.sync()
}
