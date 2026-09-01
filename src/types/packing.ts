/** 货物三个维度的轴标识 */
export type Axis = 'length' | 'width' | 'height'

/** 货物方向(旋转方向)定义：描述货物以哪个面着地、如何摆放 */
export interface DirectionVisual {
  /** 方向标识，如 A/B/C/D */
  key: string
  /** 方向中文名，如 “平放”、“侧立” */
  label: string
  /** 地面摆放的简要说明，如 “长×宽 着地” */
  note: string
  /** 俯视图中箱体的“进深”边取自产品的哪个维度 */
  depthAxis: Axis
  /** 俯视图中箱体的“横向”边取自产品的哪个维度 */
  widthAxis: Axis
  /** 在画布中的旋转角度(度)，用于区分横放等方向 */
  angle: number
  /** 用于标识该方向的色块色 */
  swatchColor: string
}

/** 可选货物库中的一条货物 */
export interface CargoOption {
  id: number
  name: string
  /** 货物类别，用于分组筛选 */
  category: string
  /** 长(mm) */
  length: number
  /** 宽(mm) */
  width: number
  /** 高(mm) */
  height: number
  /** 单件重(kg) */
  weight: number
  /** 单位 */
  unit: string
  /** 装柜用的标识色 */
  color: string
  /** 缩略图 */
  imageUrl?: string
}

/** 已选中的货物(装柜列表中的一行) */
export interface SelectedCargo {
  /** 关联 CargoOption.id，若来自自定义可为空 */
  id: number
  name: string
  category: string
  unit: string
  /** 规格(尺寸)可配置 */
  spec: {
    length: number
    width: number
    height: number
  }
  weight: number
  /** 数量 */
  quantity: number
  /** 旋转方向 */
  rotation: DirectionVisual
  color: string
  imageUrl?: string
  /** 自定义备注 */
  remark?: string
}

/** 柜型选项 */
export interface ContainerType {
  id: string
  /** 名称，如 “40 HC” */
  name: string
  /** 完整描述标题 */
  title: string
  /** 内部长(mm) */
  innerLength: number
  /** 内部宽(mm) */
  innerWidth: number
  /** 内部高(mm) */
  innerHeight: number
  /** 总容积(m³) */
  volumeM3: number
  /** 最大载重(kg) */
  maxWeightKg: number
}

/** 装柜配置参数 */
export interface PackingParams {
  /** 已选货物 */
  cargoList: SelectedCargo[]
  /** 柜型 */
  container: ContainerType
  /** 每箱溢出量(mm) */
  overflowPerBox: number
  /** 最上层桌子叠放数 */
  topTableStackCount: number
  /** 长/宽/高 尺寸最大可调整比例(%) */
  maxAdjustRatio: number
  /** 用户自定义内容 */
  customContent: string
}

/** 装柜接口请求体 */
export interface PackingRequest {
  params: PackingParams
}

/** 柜子立方米利用情况 */
export interface CubicMeter {
  used_volume_m3: number
  used_percent: number
  free_volume_m3: number
  total_volume_m3: number
}

/** 柜内所装货物行 */
export interface CargoLine {
  skuid: number
  cargo_name: string
  pieces_total: number
  /** 本次柜内装量 */
  pieces: number
  color: string
}

/** 单个柜子结果 */
export interface ContainerResult {
  container_index: number
  equipment_title: string
  pieces_total: number
  cubic_meter: CubicMeter
  packing_diagram_url: string
  cargo_lines: CargoLine[]
}

/** 装柜结果 */
export interface PackingResult {
  status: number
  container_count: number
  is_full: boolean
  containers: ContainerResult[]
}

/** 历史装柜记录(一条) */
export interface PackingHistoryItem {
  /** 唯一 ID */
  id: string
  /** 装柜时间(ms 时间戳) */
  time: number
  /** 柜型名称，如 40 HC */
  containerName: string
  /** 货物项数 */
  cargoCount: number
  /** 总件数 */
  piecesTotal: number
  /** 总重量(kg) */
  weightKg: number
  /** 用柜数 */
  containerCount: number
  /** 平均体积利用率(%) */
  avgUsedPercent: number
  /** 当时选的货物名称摘要(前 3 项) */
  cargoSummary: string[]
  /** AI 会话轮次(首次装柜为 1，每调整一次 +1) */
  round?: number
  /** 当时的装柜参数 */
  params: PackingParams
  /** 当时的装柜结果 */
  result: PackingResult
}

/** AI 调整意图(结构化操作，由各 demo 交互手势翻译而来) */
export type AiOp =
  | { kind: 'qty'; skuid: number; qty: number }
  | { kind: 'add'; optionId: number; qty?: number }
  | { kind: 'remove'; skuid: number }
  | { kind: 'container'; containerId: string }
  | { kind: 'replan' }

/** AI 会话的一轮记录 */
export interface AiTurn {
  id: number
  role: 'user' | 'ai'
  text: string
  time: number
}

/** AI 多轮会话状态 */
export interface AiSession {
  sessionId: string | null
  /** 已完成的 AI 轮次(首次装柜为 1) */
  round: number
  /** AI 计算中 */
  thinking: boolean
  /** 会话记录(按时间正序) */
  turns: AiTurn[]
}
