/**
 * 解析通路名稱，提取原名稱和別稱
 * 支持格式：原名稱[別稱1,別稱2] 或 原名稱(別稱)
 */
export function parseChannelName(channelName: string): {
  baseName: string;
  aliases: string[];
  fullName: string;
} {
  const fullName = channelName.trim();
  
  // 嘗試匹配 [別稱1,別稱2] 格式
  const bracketMatch = fullName.match(/^(.+?)\[(.+?)\]$/);
  if (bracketMatch) {
    const baseName = bracketMatch[1].trim();
    const aliasesStr = bracketMatch[2].trim();
    const aliases = aliasesStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
    return { baseName, aliases, fullName };
  }
  
  // 嘗試匹配 (別稱) 格式（但這可能與備註混淆，優先使用括號格式）
  const parenMatch = fullName.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    const baseName = parenMatch[1].trim();
    const aliasesStr = parenMatch[2].trim();
    const aliases = aliasesStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
    return { baseName, aliases, fullName };
  }
  
  // 沒有別稱
  return { baseName: fullName, aliases: [], fullName };
}

// 取得通路的標準化 key：拆逗號/全形逗號、去空白、小寫、去重並排序
export function getChannelCanonicalKey(name: string): string {
  const tokens = name
    .split(/[,，]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) return name.trim().toLowerCase();
  return Array.from(new Set(tokens)).sort().join('|');
}

/**
 * 檢查關鍵字是否匹配通路名稱（支持別稱）
 */
export function matchesChannelName(keyword: string, channelName: string): { matched: boolean; isExact: boolean; isAlias: boolean } {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const normalizedName = channelName.trim().toLowerCase();

  if (!normalizedKeyword) {
    return { matched: false, isExact: false, isAlias: false };
  }

  const matched = normalizedName.includes(normalizedKeyword);
  return {
    matched,
    isExact: matched && normalizedName === normalizedKeyword,
    isAlias: false, // 簡化邏輯：不處理別名，只做字串包含
  };
}

