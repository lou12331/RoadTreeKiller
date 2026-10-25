// 遊戲靜態資料：樹種、成長階段、設備、升級、成就、新聞。
// 數值依企劃書初版提案，標註「平衡」者為經濟模擬後調整的值。

export const TARGET_TREES = 92_776;

export type SpeciesId = 'banyan' | 'camphor' | 'terminalia' | 'cassia' | 'sweetgum' | 'bishopwood' | 'goldenrain';

export interface Species {
  id: SpeciesId;
  name: string;
  hp: number;
  gold: number;
  feature: string;
}

export const SPECIES: Species[] = [
  { id: 'banyan', name: '榕樹', hp: 100, gold: 12, feature: '寬樹冠、氣根' },
  { id: 'camphor', name: '樟樹', hp: 90, gold: 11, feature: '濃密常綠樹冠' },
  { id: 'terminalia', name: '小葉欖仁', hp: 75, gold: 9, feature: '層次傘形樹冠' },
  { id: 'cassia', name: '阿勃勒', hp: 70, gold: 9, feature: '黃色花串' },
  { id: 'sweetgum', name: '楓香', hp: 85, gold: 10, feature: '橙紅掌狀葉' },
  { id: 'bishopwood', name: '茄苳', hp: 110, gold: 13, feature: '粗幹與茂密樹冠' },
  { id: 'goldenrain', name: '臺灣欒樹', hp: 80, gold: 10, feature: '黃花、紅褐色果實' },
];

export type StageId = 'sapling' | 'mature' | 'giant';

export const STAGES: { id: StageId; name: string; weight: number; hp: number; gold: number }[] = [
  { id: 'sapling', name: '幼樹', weight: 0.3, hp: 0.3, gold: 0.5 },
  { id: 'mature', name: '成樹', weight: 0.6, hp: 1.0, gold: 1.0 },
  { id: 'giant', name: '巨樹', weight: 0.1, hp: 5.0, gold: 6.0 },
];
export const NO_GIANT_BEFORE = 100; // 開場前幾棵不出現巨樹（改為成樹）

export const HEALTH = {
  healthy: { name: '健康', weight: 0.8, hp: 1.0, gold: 1.0 },
  unhealthy: { name: '不健康', weight: 0.2, hp: 0.6, gold: 0.8 },
};

/** 進度分段的金幣倍率（企劃書建議值）。 */
export const TIERS: { from: number; gold: number }[] = [
  { from: 0, gold: 1 },
  { from: 500, gold: 2 },
  { from: 2_000, gold: 5 },
  { from: 5_000, gold: 15 },
  { from: 10_000, gold: 50 },
  { from: 20_000, gold: 200 },
  { from: 40_000, gold: 1_000 },
  { from: 70_000, gold: 5_000 },
];

/**
 * 樹木血量曲線（平衡）：[已砍伐數, 平均樹種成樹的 HP]，錨點之間以對數內插，平滑成長。
 * 企劃書的樹木 HP 不隨進度成長，但後期設備 DPS 高達數十萬，若不調整，衛星出現前遊戲就會結束。
 * 第一棵成樹約 15 HP；實際 HP 再乘上樹種、成長階段與健康倍率。
 */
export const HP_CURVE: [number, number][] = [
  [0, 15],
  [250, 43],
  [1_250, 130],
  [3_500, 520],
  [7_500, 2_700],
  [15_000, 14_000],
  [30_000, 78_000],
  [55_000, 330_000],
  [81_000, 1_400_000],
  [TARGET_TREES, 2_000_000],
];

export const PHASES: { from: number; name: string; desc: string }[] = [
  { from: 0, name: '人工伐木', desc: '斧頭與第一台電鋸' },
  { from: 100, name: '機械化', desc: '揮斧機與加速' },
  { from: 1_000, name: '工業化', desc: '粉碎機、伐木車' },
  { from: 5_000, name: '全面自動化', desc: '無人機、快速結算' },
  { from: 20_000, name: '高科技伐木', desc: '雷射砲、批次砍伐' },
  { from: 50_000, name: '終極伐木', desc: '衛星、極速結算' },
];

export interface Equipment {
  id: string;
  name: string;
  cost: number;
  dps: number;
  desc: string;
  icon: string;
}

export const EQUIPMENT: Equipment[] = [
  { id: 'chainsaw', name: '電鋸', cost: 50, dps: 1, desc: '樹幹旁持續鋸切', icon: '🪚' },
  { id: 'autoaxe', name: '自動揮斧機', cost: 500, dps: 8, desc: '機械臂揮斧', icon: '🦾' },
  { id: 'shredder', name: '樹木粉碎機', cost: 5_000, dps: 60, desc: '旋轉鋸片與木屑', icon: '⚙️' },
  { id: 'truck', name: '自動伐木車', cost: 50_000, dps: 450, desc: '車輛機械臂', icon: '🚛' },
  { id: 'drone', name: '伐木無人機', cost: 500_000, dps: 3_500, desc: '空中鋸切（不是替誰開路）', icon: '🛸' },
  { id: 'laser', name: '雷射伐木砲', cost: 5_000_000, dps: 25_000, desc: '光束切割', icon: '🔫' },
  { id: 'satellite', name: '軌道伐木衛星', cost: 50_000_000, dps: 180_000, desc: '天空光柱', icon: '🛰️' },
];

export const EQUIP_GROWTH = 1.15;
export const AXE_BASE_COST = 15;
export const AXE_GROWTH = 1.18;

export type UpgradeEffect =
  | { kind: 'clickMul'; value: number }
  | { kind: 'dpsMul'; value: number; only?: number[] }
  | { kind: 'goldMul'; value: number }
  | { kind: 'autoGoldMul'; value: number };

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  cost: number; // 平衡
  unlock: { felled?: number; equipment?: number };
  unlockText: string;
  effect: UpgradeEffect;
  icon: string;
}

export const UPGRADES: Upgrade[] = [
  { id: 'whetstone', name: '磨刀石', desc: '手動傷害 ×2', cost: 100, unlock: { felled: 10 }, unlockText: '砍倒 10 棵', effect: { kind: 'clickMul', value: 2 }, icon: '🪨' },
  { id: 'license', name: '最有利標', desc: '設備 DPS +25%｜決標只比預算少 2 元', cost: 1_000, unlock: { felled: 100 }, unlockText: '砍倒 100 棵', effect: { kind: 'dpsMul', value: 1.25 }, icon: '📜' },
  { id: 'night', name: '夜間施工許可', desc: '設備 DPS ×2', cost: 20_000, unlock: { felled: 1_000 }, unlockText: '砍倒 1,000 棵', effect: { kind: 'dpsMul', value: 2 }, icon: '🌙' },
  { id: 'budget', name: '計點制度上線', desc: '金幣收益 ×2｜移除一棵最高 8 點，樹穴維護 0.2 點', cost: 150_000, unlock: { felled: 3_000 }, unlockText: '砍倒 3,000 棵', effect: { kind: 'goldMul', value: 2 }, icon: '💰' },
  { id: 'mechanize', name: '全面機械化', desc: '初階設備（電鋸、揮斧機、粉碎機）DPS ×5', cost: 250_000, unlock: { equipment: 50 }, unlockText: '持有 50 台設備', effect: { kind: 'dpsMul', value: 5, only: [0, 1, 2] }, icon: '🏭' },
  { id: 'meeting', name: '專家會勘', desc: '所有設備 DPS ×3｜移除 56 棵、保留 21 棵', cost: 20_000_000, unlock: { felled: 10_000 }, unlockText: '砍倒 10,000 棵', effect: { kind: 'dpsMul', value: 3 }, icon: '🏛️' },
  { id: 'urgent', name: '公共安全考量', desc: '設備砍倒的樹金幣 ×2｜理由萬用，結算加倍', cost: 1_000_000_000, unlock: { felled: 30_000 }, unlockText: '砍倒 30,000 棵', effect: { kind: 'autoGoldMul', value: 2 }, icon: '📋' },
  { id: 'special', name: '依規範辦理', desc: '所有設備 DPS ×10｜規範說可以', cost: 5_000_000_000, unlock: { felled: 60_000 }, unlockText: '砍倒 60,000 棵', effect: { kind: 'dpsMul', value: 10 }, icon: '🏦' },
];

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  felled?: number;
  equipId?: string;
  clicks?: number;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: '第一滴樹汁', desc: '砍倒第 1 棵樹', felled: 1, icon: '💧' },
  { id: 'hundred', name: '這只是開始', desc: '砍倒 100 棵樹', felled: 100, icon: '🌿' },
  { id: 'k1', name: '行道樹管理員', desc: '砍倒 1,000 棵樹', felled: 1_000, icon: '🪓' },
  { id: 'y2024', name: '去年的量', desc: '砍倒 1,425 棵樹（2024 年全市移除數）', felled: 1_425, icon: '📅' },
  { id: 'y2025', name: '今年的量', desc: '砍倒 3,164 棵樹（2025 年全市移除數）', felled: 3_164, icon: '📈' },
  { id: 'rumor4k', name: '網傳的量', desc: '砍倒 4,000 棵樹（網路流傳的數字，已被官方駁斥）', felled: 4_000, icon: '📱' },
  { id: 'replant', name: '種回來了嗎？', desc: '砍倒 13,225 棵樹（市府公布的新植株數）', felled: 13_225, icon: '🌱' },
  { id: 'k10', name: '人行道拓寬計畫', desc: '砍倒 10,000 棵樹', felled: 10_000, icon: '🚧' },
  { id: 'k50', name: '你確定嗎？', desc: '砍倒 50,000 棵樹', felled: 50_000, icon: '❓' },
  { id: 'all', name: '一棵不留', desc: '砍倒 92,776 棵樹', felled: TARGET_TREES, icon: '🏁' },
  { id: 'saw', name: '文明的聲音', desc: '購買第一台電鋸', equipId: 'chainsaw', icon: '🪚' },
  { id: 'drone', name: '替無人機開路', desc: '購買第一台無人機（本成就涉及謠言，已報警蒐證）', equipId: 'drone', icon: '🛸' },
  { id: 'sat', name: '科技始終來自人性', desc: '購買第一台衛星', equipId: 'satellite', icon: '🛰️' },
  { id: 'click1k', name: '腱鞘炎預備', desc: '點擊「砍！」1,000 次', clicks: 1_000, icon: '👆' },
  { id: 'click10k', name: '人肉電鋸', desc: '點擊「砍！」10,000 次', clicks: 10_000, icon: '💪' },
];

// 新聞快訊：在新聞中出現過的數字觸發（2024 年移除 1,425 棵、2025 年 3,164 棵、議員質疑一任 5,819 棵、
// 計點制度、市府新植 13,225 株、無人機謠言、樹木醫談強剪、學者評論等），以黑色幽默改寫。
export const NEWS: { at: number; title: string; body: string }[] = [
  { at: 100, title: '市府：移除皆基於公共安全考量', body: '對於路樹接連消失，主管機關重申一切基於公共安全考量。網友：那現在應該非常安全了。' },
  { at: 1_425, title: '移除量已達去年全年水準', body: '統計顯示，本年度移除數已追平去年全年的 1,425 棵。今年才剛開始。' },
  { at: 3_164, title: '官方：八成是自然死亡', body: '官方說明移除原因多為腐朽、病蟲害、天災等自然因素，以及一位穿螢光背心的玩家。' },
  { at: 5_819, title: '議員質疑：一任移除 5,819 棵', body: '議員在質詢中列出一任內的移除總數。你剛好追平，議會沒有人敢問你是誰。' },
  { at: 10_000, title: '計點制度引熱議：移除最高 8 點、樹穴維護 0.2 點', body: '主管機關澄清：依工作難易度記點，派工由我們決定。你的計點表已經寫不下了。' },
  { at: 13_225, title: '市府：已新植 13,225 株', body: '市府公布新植樹數量。你砍的剛好一樣多，帳面平衡，皆大歡喜。' },
  { at: 20_000, title: '本市樹蔭覆蓋率創新低', body: '最新調查顯示本市樹蔭覆蓋率創歷史新低，防曬乳銷量則創下歷史新高。' },
  { at: 30_000, title: '網傳砍樹替無人機開路 市府：已報警蒐證', body: '市府駁斥網路謠言，已與警方展開蒐證。你的伐木無人機表示無辜。' },
  { at: 50_000, title: '樹木醫：長期強剪終將走向移除', body: '專家提醒過度強剪會讓樹木一步步走向移除。你直接跳過了強剪這一步。' },
  { at: 80_000, title: '學者：「種了幾棵」和「失去什麼樹」是兩回事', body: '學者指出新植株數不等於失去的老樹。但計點表上只有前者。' },
];

export const INTRO_TEXT = '因為各種原因，你現在需要砍掉總共 92,776 棵樹，不要問我為什麼，反正砍就對了。';
export const INTRO_TEXT_NGPLUS = '市府種下的 92,776 棵樹苗，不知不覺都長大了。因為各種原因，你又需要把它們砍掉。不要問我為什麼。';

export const OFFLINE_MAX_SECONDS = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;

/**
 * 砍樹彈幕：取材自 2024–2026 年台北市路樹移除相關新聞（計點制度、標案差 2 元、斷頭式修剪、
 * 東門茄苳、撫遠公園、美崙公園停車場、無人機謠言、移除與植樹數字等），以黑色幽默改寫。
 * {} 內為關鍵字，畫面上會醒目標示。
 */
export const DANMAKU: string[] = [
  '移除一棵 {8 點}，樹穴維護 {0.2 點}，你算算看',
  '{點數不足每點罰 500}，斧頭不敢停',
  '本棵已計 {8 點}，感謝您的配合',
  '計點表上好像沒有「{不砍}」這一項',
  '每一棵樹，都是一個 {KPI}',
  '標案只比預算少 {2 元}，精準到令人感動',
  '{斷頭式修剪}：今年砍頭，明年砍身',
  '強剪三年，{自然死亡}，流程完美',
  '{八成}是自然死亡，剩下兩成是自然被砍',
  '死因：腐朽、病蟲害、天災，還有{你}',
  '原定{移植}，實際{切塊}，運輸比較方便',
  '{東門老茄苳}：說好的搬家呢？',
  '去年 {1,425} 棵，今年 {3,164} 棵，成長率亮眼',
  '別擔心，我們也種了 {13,225} 株，只是比較小',
  '「種了幾棵」和「{失去什麼樹}」是兩回事喔',
  '紅白{警示帶}只是提醒安全，不是預告（大概）',
  '專家會勘：移除 {56} 棵、保留 {21} 棵，效率滿分',
  '{地下停車場}需要 {119} 棵樹讓位',
  '說砍樹替{無人機}開路？{刑大}已在蒐證，發言請小心',
  '造謠砍樹會違反{社維法}，真的砍就不會',
  '網路說{四千棵}，官方說是 {3,164}，差很多好嗎',
  '輿論太大不敢{修剪}，那就……',
  '{颱風}：這次真的不是我',
  '{樹冠面積}銳減，防曬乳銷量暴增',
  '{高風險樹}移除後，風險就歸零了',
  '沒有樹，就沒有{倒樹壓車}的風險',
  '{病蟲害}最怕的，就是沒有樹',
  '本棵已完成{公共安全化}',
  '先列{高風險}，再請{專家}，最後請{電鋸}',
  '這不是砍樹，是{空間活化}',
  '公園處：這叫{修剪}；樹：這叫{截肢}',
  '{都市之肺}手術成功，病人已停止呼吸',
  '本路段已全面完成{永續發展}',
  '行人：我的{樹蔭}呢？',
  '{麻雀}已讀不回',
  '{蟬}：今年夏天要去哪裡叫',
  '{樹醫生}考慮改行看牙',
  '樹：我只是{站在這裡}而已',
  '市民請自備{陽傘}，謝謝合作',
  '{依規範辦理}，規範說可以',
  '又一棵{行道樹}光榮退休',
  '一切都在{掌握之中}',
];
