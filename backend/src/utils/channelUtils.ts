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

/**
 * 檢查關鍵字是否匹配通路名稱（支持別稱）
 */
export function matchesChannelName(keyword: string, channelName: string): { matched: boolean; isExact: boolean; isAlias: boolean } {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const { baseName, aliases, fullName } = parseChannelName(channelName);
  
  // 精確匹配（不區分大小寫）
  if (baseName.toLowerCase() === normalizedKeyword) {
    return { matched: true, isExact: true, isAlias: false };
  }
  
  // 別稱精確匹配
  for (const alias of aliases) {
    if (alias.toLowerCase() === normalizedKeyword) {
      return { matched: true, isExact: true, isAlias: true };
    }
  }
  
  // 檢查是否為完整單詞匹配（避免部分匹配）
  // 例如："net" 不應該匹配 "Netflix"，但 "net" 應該匹配 "NET"
  const baseNameLower = baseName.toLowerCase();
  const fullNameLower = fullName.toLowerCase();
  
  // 轉義特殊字符
  const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 檢查關鍵字是否為完整單詞（使用單詞邊界）
  const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
  
  // 檢查是否匹配完整單詞（在原名稱中）
  if (wordBoundaryRegex.test(baseNameLower)) {
    return { matched: true, isExact: false, isAlias: false };
  }
  
  // 檢查別稱中的完整單詞匹配
  for (const alias of aliases) {
    const aliasLower = alias.toLowerCase();
    if (aliasLower === normalizedKeyword) {
      // 別稱精確匹配已在上面處理
      continue;
    }
    if (wordBoundaryRegex.test(aliasLower)) {
      return { matched: true, isExact: false, isAlias: true };
    }
  }
  
  // 允許部分匹配（關鍵字包含在名稱中，或名稱包含在關鍵字中）
  // 這樣可以支持部分關鍵字查詢，例如 "NET" 可以匹配 "NET" 和 "NETFLIX"，"蝦皮" 可以匹配 "蝦皮購物"、"蝦皮"
  if (normalizedKeyword.length >= 1) {
    // 檢查關鍵字是否在名稱中（簡單包含匹配）
    if (baseNameLower.includes(normalizedKeyword) || fullNameLower.includes(normalizedKeyword)) {
      return { matched: true, isExact: false, isAlias: false };
    }
    
    // 檢查別稱中的部分匹配
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower.includes(normalizedKeyword)) {
        return { matched: true, isExact: false, isAlias: true };
      }
    }
  }
  
  return { matched: false, isExact: false, isAlias: false };
}

