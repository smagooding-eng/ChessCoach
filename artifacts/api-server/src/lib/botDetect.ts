// Tells crawlers, link-preview fetchers, scripts and automated browsers apart
// from people, by user agent (plus the browser's own "I'm automated" flag).
// Bot hits are stored in bot_visits instead of page_views, so every people
// number in Admin (views, visitors, funnel) leaves them out.

const KINDS: [RegExp, string][] = [
  // Our own tools: store/link-preview screenshot jobs, and the Share Kit's
  // screenshot service (Microlink, which renders pages in headless Chrome).
  [/chessscoutstoreshots|chessscout-shots|microlink/i, "ChessScout's own tools"],
  [/facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher/i, "Facebook"],
  [/googlebot|google-inspectiontool|googleother|adsbot-google|mediapartners-google|google-read-aloud|storebot-google|google-pagerenderer/i, "Google"],
  [/bingbot|bingpreview|msnbot|adidxbot/i, "Bing"],
  [/gptbot|chatgpt-user|oai-searchbot/i, "OpenAI"],
  [/claudebot|claude-user|claude-searchbot|anthropic-ai/i, "Anthropic"],
  [/perplexitybot|perplexity-user/i, "Perplexity"],
  [/twitterbot/i, "X / Twitter"],
  [/linkedinbot/i, "LinkedIn"],
  [/slackbot|slack-imgproxy/i, "Slack"],
  [/discordbot/i, "Discord"],
  [/telegrambot/i, "Telegram"],
  [/whatsapp/i, "WhatsApp"],
  [/applebot/i, "Apple"],
  [/duckduckbot|duckassistbot/i, "DuckDuckGo"],
  [/yandex/i, "Yandex"],
  [/baiduspider/i, "Baidu"],
  [/bytespider|tiktokspider/i, "ByteDance"],
  [/ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|dataforseobot|blexbot|serpstatbot|rogerbot|seznambot/i, "SEO crawler"],
  [/ccbot|amazonbot|diffbot|omgili|cohere-ai|youbot|imagesiftbot/i, "Data / AI crawler"],
  [/uptimerobot|pingdom|statuscake|betteruptime|uptime-kuma|site24x7|freshping|checkly/i, "Uptime monitor"],
  [/lighthouse|pagespeed|gtmetrix/i, "Speed test"],
  [/headlesschrome|playwright|puppeteer|phantomjs|selenium|webdriver|electron\/.*headless/i, "Headless browser"],
  [/\b(curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|axios|node-fetch|undici|libwww-perl|scrapy)\b/i, "Script"],
  [/bot\b|bot\/|crawl|spider|slurp|scanner|fetcher|preview|archiver|validator/i, "Other bot"],
];

/** The bot's family ("Google", "Facebook"...) or null for a person. */
export function botKind(userAgent: string | undefined | null, automated = false): string | null {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "No user agent";
  for (const [re, kind] of KINDS) if (re.test(ua)) return kind;
  if (automated) return "Headless browser";
  return null;
}
