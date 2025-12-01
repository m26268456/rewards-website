// 資料導入模板
// 請將您提供的完整資料填入此文件，然後將此文件重命名為 importData.ts

// ============================================
// 信用卡資料 (DEFAULT_CARDS)
// ============================================
export const DEFAULT_CARDS = [
  // 請將您提供的所有卡片資料複製到這裡
  // 格式範例：
  {
    name: "Richart卡",
    cardNote: "~12/31 <a href='https://reurl.cc/bmrG6M' target='_blank'>詳情</a>\n單筆計算 無條件捨去 入帳日次二營業日回饋\n須設定台新帳戶扣繳台新信用卡帳款",
    groups: [
      {
        name: "一般消費",
        needsToggle: false,
        groupNote: "",
        rewards: [{ merchant: "一般消費", percent: 0.3, note: "" }]
      },
      // ... 其他方案
    ]
  },
  // ... 其他卡片（U Bear卡、CUBE卡、蝦皮購物聯名卡、國泰簽帳金融卡、Gogoro Rewards卡、friDay聯名卡）
];

// ============================================
// 支付方式資料 (DEFAULT_PAYMENTS)
// ============================================
export const DEFAULT_PAYMENTS = [
  // 請將您提供的所有支付方式資料複製到這裡
  // 格式範例：
  {
    name: "全支付 (PX Pay Plus)",
    paymentNote: "<a href='https://reurl.cc/OmNVvg' target='_blank'>活動說明</a> / <a href='https://reurl.cc/DO2mjQ' target='_blank'>通路列表</a>\n四捨五入 即時回饋",
    rewards: [
      { merchant: "屈臣氏", percent: 10.0, note: "" },
      // ... 其他通路
    ]
  },
  // ... 其他支付方式（LINE Pay、台新Pay、台灣Pay、街口支付）
];

// ============================================
// 常用通路 (DEFAULT_MERCHANTS)
// ============================================
export const DEFAULT_MERCHANTS = [
  "7-11",
  "foodpanda",
  "全聯",
  "家樂福",
  "Uber Eats",
  "蝦皮",
  "全家",
  "KFC",
  "LINE Pay"
];

