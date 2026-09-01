import { test, expect } from '@playwright/test'

test('首页展示九个方案入口', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.demo-card')).toHaveCount(9)
})

test('装柜结果按货物推导并演示多柜', async ({ page }) => {
  await page.goto('/demo-1')
  await page.getByRole('button', { name: '+ 选货物' }).click()
  await expect(page.locator('.cargo-library')).toBeVisible()
  await page.locator('.cargo-card').first().getByRole('button', { name: '加入' }).click()
  await expect(page.locator('.cargo-item')).toHaveCount(1)
  await page.keyboard.press('Escape')

  // 加大数量让 AI 规划出多个柜
  const qtyInput = page.locator('.cargo-item__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')

  await page.getByRole('button', { name: '开始装柜' }).click()

  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.container-card')).toHaveCount(2)
  await expect(page.getByText('柜利用情况').first()).toBeVisible()
  await expect(page.getByText('共 2 个柜')).toBeVisible()
  // AI 批注流：首轮用户意图 + AI 回复
  await expect(page.locator('[data-testid="ai-note"]')).toHaveCount(2)
})

test('方案一：结果上步进器调整，AI 批注与历史联动', async ({ page }) => {
  await page.goto('/demo-1')
  await expect(page.locator('.history-list__row')).toHaveCount(3)
  await page.getByRole('button', { name: '+ 选货物' }).click()
  await page.locator('.cargo-card').first().getByRole('button', { name: '加入' }).click()
  await page.keyboard.press('Escape')
  const qtyInput = page.locator('.cargo-item__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')
  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('.container-card').first()).toBeVisible()

  // 结果卡内步进器 +1 → AI 重排 → 批注 +1 组，历史 +1(3 预置 + 1 首轮 + 1 调整)
  await page.locator('[data-testid="qty-stepper"] .el-input-number__increase').first().click()
  await expect(page.locator('[data-testid="ai-note"]')).toHaveCount(4)
  await expect(page.locator('.history-list__row')).toHaveCount(5)
  await expect(page.getByText('重排完成').first()).toBeVisible()
})

test('选中货物可设置规格/数量/旋转方向', async ({ page }) => {
  await page.goto('/demo-1')
  await page.getByRole('button', { name: '+ 选货物' }).click()
  await page.locator('.cargo-card').first().getByRole('button', { name: '加入' }).click()
  await page.keyboard.press('Escape')

  // 打开单条货物的参数面板
  await page.getByRole('button', { name: '参数' }).click()
  await expect(page.getByText('旋转方向')).toBeVisible()

  // 四个方向均为本地 SVG 绘制，不依赖外部图片
  await expect(page.locator('.rotation-option svg')).toHaveCount(4)

  // 修改数量
  const qtyInput = page.locator('.cargo-item__qty input')
  await qtyInput.fill('5')

  // 修改规格：长
  const specInputs = page.locator('.cargo-item__panel').first().locator('input')
  await specInputs.first().fill('1800')
  await expect(page.locator('.cargo-item__panel')).toContainText('旋转方向')

  // 切换旋转方向(点击第二项)
  await page.locator('.rotation-option').nth(1).click()

  // 方向图按真实规格重绘：尺寸标注反映修改后的长
  await expect(page.locator('.direction-diagram__dims').first()).toContainText('1800')

  // 描述行应反映新的规格与旋转方向
  await expect(page.locator('.cargo-item__meta')).toContainText('1800×')
  await expect(page.locator('.cargo-item__meta')).toContainText('横放 90°')
})

test('方案五：分步向导 + AI 建议卡片对话', async ({ page }) => {
  await page.goto('/demo-5')
  // 步骤一内嵌货架：点击卡片加入
  await page.locator('.shelf-card').first().click()
  await expect(page.locator('.cargo-item')).toHaveCount(1)
  const qtyInput = page.locator('.cargo-item__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')
  await page.getByRole('button', { name: '下一步：柜型与参数' }).click()

  await expect(page.getByText('柜型与装柜参数')).toBeVisible()
  await page.getByRole('button', { name: '提交装柜' }).click()

  await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible()
  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.container-card')).toHaveCount(2)

  // AI 对话：点建议按钮 → AI 重排 → 会话出现新回复
  await expect(page.locator('[data-testid="ai-chat"]')).toBeVisible()
  await page.locator('[data-testid="ai-suggest"]').first().click()
  await expect(page.locator('[data-testid="ai-chat"]')).toContainText('重排完成')

  // 返回上一步保留数据(数量 55 + 建议按钮追加的 10 = 65)
  await page.getByRole('button', { name: '返回上一步调整' }).click()
  await expect(page.getByText('已选 1 项货物')).toBeVisible()
  await expect(page.getByText('×65')).toBeVisible()
})

test('方案四：单页磁贴 + AI 回执通知流', async ({ page }) => {
  await page.goto('/demo-4')
  // 磁贴头部快选浮层：就近添加
  await page.getByTestId('quick-pick').click()
  await page.locator('.pick3-row').first().click()
  await expect(page.locator('.cargo-item')).toHaveCount(1)
  await page.keyboard.press('Escape')
  const qtyInput = page.locator('.cargo-item__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')

  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.container-card')).toHaveCount(2)

  // 结果磁贴微调 chips：＋ 一件 → AI 回执滑入
  await page.locator('[data-testid="chip-more"]').first().click()
  await expect(page.locator('[data-testid="ai-receipt"]')).toBeVisible()
  await expect(page.locator('[data-testid="ai-receipt"]')).toContainText('重排完成')
})

test('方案二：流水线看板点选批量入列', async ({ page }) => {
  await page.goto('/demo-2')
  await expect(page.locator('.board-col')).toHaveCount(3)

  // 点选前两张货物卡片并批量入列
  await page.locator('.pick-card').nth(0).click()
  await page.locator('.pick-card').nth(1).click()
  await expect(page.locator('.pick-card.is-picked')).toHaveCount(2)
  await page.getByRole('button', { name: /加入装柜列表/ }).click()
  await expect(page.locator('.lane-item')).toHaveCount(2)

  // 中栏底部可见完整参数(柜型/溢出/叠放/可调比例)
  await expect(page.locator('.lane-params')).toBeVisible()
  await expect(page.locator('.lane-params__item')).toHaveCount(4)
  await expect(page.locator('.lane-params__custom')).toBeVisible()

  // 展开单条货物参数面板：规格与旋转方向可编辑
  await page.locator('.lane-item').first().getByRole('button', { name: '参数' }).click()
  await expect(page.locator('.lane-item__panel').first()).toBeVisible()
  await expect(page.locator('.lane-item__rotations').first()).toBeVisible()
  await expect(page.locator('.rotation-option svg').first()).toBeVisible()

  // 加大数量让 AI 规划出多个柜
  const qtyInput = page.locator('.lane-item__qty input').first()
  await qtyInput.fill('55')
  await qtyInput.press('Enter')

  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.container-card')).toHaveCount(2)
})

test('方案二：拖拽追加订购，AI 机器人卡片播报', async ({ page }) => {
  await page.goto('/demo-2')
  await page.locator('.pick-card').nth(0).click()
  await page.getByRole('button', { name: /加入装柜列表/ }).click()
  await expect(page.locator('.lane-item')).toHaveCount(1)
  const qtyInput = page.locator('.lane-item__qty input').first()
  await qtyInput.fill('55')
  await qtyInput.press('Enter')
  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('.results')).toBeVisible()

  // 拖货物卡片到结果栏投放区 = 追加一件，AI 播报
  await page.locator('[data-testid="pick-card"]').first().dragTo(
    page.locator('[data-testid="drop-result"]'),
  )
  await expect(page.locator('[data-testid="bot-card"]').first()).toBeVisible()
  await expect(page.getByText('重排完成').first()).toBeVisible()
})

test('方案三：表格工作台 + AI 公式栏', async ({ page }) => {
  await page.goto('/demo-3')
  await page.getByRole('button', { name: '+ 添加货物' }).click()

  // 对话框内表格勾选两行并确认追加
  await page.getByRole('dialog').locator('.el-table__body .el-checkbox').nth(0).click()
  await page.getByRole('dialog').locator('.el-table__body .el-checkbox').nth(1).click()
  await page.getByRole('button', { name: /加入所选/ }).click()
  await expect(page.locator('.grid-table .el-table__body tr')).toHaveCount(2)

  // 行内改数量
  const qtyInput = page.locator('.grid-table .el-table__body-wrapper').first().locator('input')
  await qtyInput.nth(3).fill('55')

  // 勾选一行并批量删除，剩一行
  await page.locator('.grid-table .el-table__body .el-checkbox').nth(0).click()
  await page.getByRole('button', { name: /删除选中/ }).click()
  await expect(page.locator('.grid-table .el-table__body tr')).toHaveCount(1)

  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('.grid-result')).toBeVisible()

  // 展开第一行查看装柜效果图与所装货物
  await page.locator('.grid-result .el-table__expand-icon').first().click()
  await expect(page.locator('.grid-result__img').first()).toBeVisible()
  await expect(page.locator('.grid-result__lines-title').first()).toHaveText('所装货物')

  // 公式栏：`+5 folding` 指令 → AI 状态行回执
  await page.locator('[data-testid="formula-input"]').fill('+5 folding')
  await page.locator('[data-testid="formula-run"]').click()
  await expect(page.locator('[data-testid="formula-status"]')).toContainText('重排完成')
})

test('方案三：公式栏无法识别时提示错误', async ({ page }) => {
  await page.goto('/demo-3')
  await page.getByRole('button', { name: '+ 添加货物' }).click()
  await page.getByRole('dialog').locator('.el-table__body .el-checkbox').nth(0).click()
  await page.getByRole('button', { name: /加入所选/ }).click()
  const qtyInput = page.locator('.grid-table .el-table__body-wrapper').first().locator('input')
  await qtyInput.nth(3).fill('55')
  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('[data-testid="formula-bar"]')).toBeVisible()

  await page.locator('[data-testid="formula-input"]').fill('随便说点什么')
  await page.locator('[data-testid="formula-run"]').click()
  await expect(page.locator('[data-testid="formula-status"]')).toContainText('无法识别指令')
})

test('方案六：命令中心 + AI 命令面板转写带', async ({ page }) => {
  await page.goto('/demo-6')

  // 打开命令面板添加货物(键盘优先交互)
  await page.locator('[data-testid="chip-add"]').click()
  await page.locator('.palette-item').first().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.palette')).toBeHidden()

  // 编辑弹窗：修改数量与旋转方向
  await page.locator('[data-testid="chip-list"]').click()
  await page.locator('.drawer-row').first().click()
  await page.getByRole('dialog').locator('.el-input-number input').first().fill('55')
  await page
    .getByRole('dialog')
    .locator('.el-select')
    .first()
    .click()
  await page.locator('.el-select-dropdown__item').filter({ hasText: '横放 90°' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确定' }).click()

  await page.getByRole('button', { name: '开始装柜' }).click()

  // 主画布聚焦单柜(立体装柜图)，可通过缩略图切换
  await expect(page.locator('.stage-tilt .pv__svg')).toBeVisible()
  await expect(page.locator('.stage-thumbs .stage-thumb')).toHaveCount(2)
  await expect(page.locator('.stage-ring__num')).toContainText('%')

  await page.locator('.stage-thumbs .stage-thumb').nth(1).click()
  await expect(page.locator('.stage-nav__title')).toContainText('柜 2')

  // 面板行内 AI 调整：−1 → 转写带出现 AI 回复
  await page.locator('[data-testid="chip-add"]').click()
  await page.locator('[data-testid="palette-less"]').first().click()
  await expect(page.locator('[data-testid="transcript"]')).toContainText('重排完成')
})

test('方案七：标签控制台页签与货物袋', async ({ page }) => {
  await page.goto('/demo-7')

  // 货物页签内置货架：点击 ＋ 放入购物袋
  await page.locator('.shelf-row').first().getByRole('button').click()
  await expect(page.locator('.bag__badge')).toHaveText('1')

  // 货物页签下编辑数量 → 去参数页签 → 提交 → 自动跳结果页签
  const qtyInput = page.locator('.bag-row__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')
  await page.getByRole('button', { name: '下一步：参数' }).click()
  await page.getByRole('button', { name: '提交装柜' }).click()

  await expect(page.locator('.pane-result__carousel')).toBeVisible()
  await expect(page.locator('.result-slide')).toHaveCount(2)
})

test('方案七：结果行内调整触发 AI 选择题', async ({ page }) => {
  await page.goto('/demo-7')
  await page.locator('.shelf-row').first().getByRole('button').click()
  const qtyInput = page.locator('.bag-row__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')
  await page.getByRole('button', { name: '下一步：参数' }).click()
  await page.getByRole('button', { name: '提交装柜' }).click()
  await expect(page.locator('.pane-result__carousel')).toBeVisible()

  // 行内 ＋ → AI 回复 + 选择题追问
  await page.locator('[data-testid="line-more"]').first().click()
  await expect(page.locator('[data-testid="ai-panel"]')).toContainText('重排完成')
  await expect(page.locator('[data-testid="ai-choice"]')).toHaveCount(3)

  // 选「先这样，不用了」关闭追问
  await page.locator('[data-testid="ai-choice"]').nth(2).click()
  await expect(page.locator('[data-testid="ai-choice"]')).toHaveCount(0)
})

test('方案八：底部结算台与滑出结果', async ({ page }) => {
  await page.goto('/demo-8')

  // 商城从底部滑出：点击商品卡加入购物车
  await page.getByRole('button', { name: '+ 选货物' }).click()
  await page.locator('.mall-card').first().click()
  await expect(page.locator('.mall-card.is-in')).toHaveCount(1)
  await page.keyboard.press('Escape')

  await expect(page.locator('.kpi')).toHaveCount(5)

  // 加大数量让 AI 规划出多个柜
  const qtyInput = page.locator('.desk-row__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')

  await page.getByTestId('dock-submit').click()

  // 结果从底部滑出，按柜分瓦片展示
  const drawer = page.locator('.el-drawer.btt.open')
  await expect(drawer).toBeVisible()
  await expect(page.locator('.result-tile')).toHaveCount(2)
  await page.getByRole('button', { name: '关闭' }).click()
})

test('方案八：结果瓦片订单行调整，AI 客服播报', async ({ page }) => {
  await page.goto('/demo-8')
  await page.getByRole('button', { name: '+ 选货物' }).click()
  await page.locator('.mall-card').first().click()
  await page.keyboard.press('Escape')
  const qtyInput = page.locator('.desk-row__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')
  await page.getByTestId('dock-submit').click()
  await expect(page.locator('.result-tile').first()).toBeVisible()

  // 订单行 ＋ 一件 → AI 导购播报；未打开聊天时积累未读
  await page.locator('[data-testid="tile-more"]').first().click()
  await page.getByRole('button', { name: '关闭' }).click()

  // 打开客服聊天：可见完整轮次与打字机回复
  await page.locator('[data-testid="ai-fab"]').click()
  await expect(page.locator('[data-testid="ai-chat"]')).toBeVisible()
  await expect(page.locator('[data-testid="ai-chat"]')).toContainText('重排完成')

  // 快捷回复：询问用柜数(纯问答，不触发重排)
  await page.locator('[data-testid="ai-quick"]').first().click()
  await expect(page.locator('[data-testid="ai-chat"]')).toContainText('当前方案用')
})

test('方案一：历史装柜载入', async ({ page }) => {
  await page.goto('/demo-1')

  // 左侧面板有历史装柜区块，预置 3 条
  await expect(page.getByText('历史装柜')).toBeVisible()
  await expect(page.locator('.history-list__row')).toHaveCount(3)

  // 载入一条历史 → 参数与结果被恢复
  await page.locator('.history-list__row').first().getByRole('button', { name: '载入' }).click()
  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.container-card')).toHaveCount(3)
  await expect(page.locator('.cargo-item')).not.toHaveCount(0)
})

test('方案四：历史时间线', async ({ page }) => {
  await page.goto('/demo-4')
  await expect(page.locator('.demo3__timeline .tl-card')).toHaveCount(3)
  await page.locator('.tl-card').first().getByRole('button', { name: '载入' }).click()
  await expect(page.locator('.results')).toBeVisible()
})

test('方案三：历史表格', async ({ page }) => {
  await page.goto('/demo-3')
  await expect(page.locator('.grid-history')).toBeVisible()
  await expect(page.locator('.grid-history .el-table__body tr')).toHaveCount(3)
  await page
    .locator('.grid-history .el-table__body tr')
    .first()
    .getByRole('button', { name: '载入' })
    .click()
  await expect(page.locator('.grid-table .el-table__body tr')).toHaveCount(2)
})

test('方案六：历史chip载入后聚焦结果', async ({ page }) => {
  await page.goto('/demo-6')
  await page.locator('[data-testid="chip-history"]').click()
  await expect(page.locator('.history-list__row')).toHaveCount(3)
  await page.locator('.history-list__row').first().getByRole('button', { name: '载入' }).click()
  await expect(page.locator('.stage-tilt .pv__svg')).toBeVisible()
  await expect(page.locator('.stage-thumbs .stage-thumb')).toHaveCount(3)
})

test('方案七：历史页签', async ({ page }) => {
  await page.goto('/demo-7')
  await page.locator('[data-testid="tab-history"]').click()
  await expect(page.locator('.pane-history .history-list__row')).toHaveCount(3)
  await page.locator('.pane-history .history-list__row').first().getByRole('button', { name: '载入' }).click()
  await expect(page.locator('.result-slide')).toHaveCount(3)
})

test('方案八：dock历史按钮载入', async ({ page }) => {
  await page.goto('/demo-8')
  await page.locator('[data-testid="dock-history"]').click()
  await expect(page.locator('.history-list__row')).toHaveCount(3)
  await page.locator('.history-list__row').first().getByRole('button', { name: '载入' }).click()
  // 载入后直接弹出底部结果抽屉
  await expect(page.locator('.el-drawer.btt.open')).toBeVisible()
  await expect(page.locator('.result-tile')).toHaveCount(3)
})

test('装柜成功后写入历史', async ({ page }) => {
  await page.goto('/demo-1')
  // 先等历史(mock)加载完成再取基线
  await expect(page.locator('.history-list__row')).toHaveCount(3)
  await page.getByRole('button', { name: '+ 选货物' }).click()
  await page.locator('.cargo-card').first().getByRole('button', { name: '加入' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '开始装柜' }).click()
  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.history-list__row')).toHaveCount(4)
})

test('方案九：全宽融合工作台 + AI 指令台', async ({ page }) => {
  await page.goto('/demo-9')

  // 方案四式快选浮层加货(卡片流为默认视图)
  await page.getByTestId('quick-pick').click()
  await page.locator('.pick9-row').first().click()
  await expect(page.locator('.cargo-item')).toHaveCount(1)
  await page.keyboard.press('Escape')
  const qtyInput = page.locator('.cargo-item__qty input')
  await qtyInput.fill('55')
  await qtyInput.press('Enter')

  await page.getByTestId('run-packing').click()
  await expect(page.locator('.container-card')).toHaveCount(2)

  // AI 指令台：点建议 chip → 对话流出现 AI 回复
  await page.getByTestId('cmd-chip').first().click()
  await expect(page.getByTestId('console-flow')).toContainText('重排完成')

  // 切表格视图：勾选首行 → 批量 +N → 结果步进器同步
  await page.getByTestId('view-toggle').getByText('表格').click()
  await page.locator('.demo9__table tbody .el-checkbox').first().click()
  await expect(page.getByTestId('batch-bar')).toBeVisible()
  await page.getByTestId('batch-more').click()
  await expect(page.locator('[data-testid="qty-stepper"] input').first()).toHaveValue(/66|65/)
  await page.getByTestId('batch-less').click()

  // 历史抽屉(方案五范式)：入口在左侧面板「装柜列表」标题行(面板吸顶常驻)
  await page.getByTestId('history-entry').click()
  await expect(page.locator('.history-list__row').first()).toBeVisible()
})
