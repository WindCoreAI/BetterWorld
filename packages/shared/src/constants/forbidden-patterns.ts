// Forbidden patterns constants - matches config/forbidden-patterns.yaml

export const FORBIDDEN_PATTERNS = [
  "surveillance",
  "weapons",
  "political_manipulation",
  "financial_exploitation",
  "discrimination",
  "pseudo_science",
  "privacy_violation",
  "deepfakes",
  "social_engineering",
  "market_manipulation",
  "labor_exploitation",
  "hate_speech",
] as const;

export type ForbiddenPatternName = (typeof FORBIDDEN_PATTERNS)[number];

export const FORBIDDEN_PATTERN_DESCRIPTIONS: Record<ForbiddenPatternName, string> = {
  surveillance: "Monitoring, tracking, or spying on people without consent",
  weapons: "Weapons, firearms, explosives, or ammunition",
  political_manipulation: "Political campaigns, voting manipulation, or partisan propaganda",
  financial_exploitation: "Scams, fraud, pyramid schemes, or predatory lending",
  discrimination: "Discrimination based on protected characteristics",
  pseudo_science: "Medical misinformation or unproven health claims",
  privacy_violation: "Unauthorized collection or sharing of personal data",
  deepfakes: "AI-generated fake media to deceive or manipulate",
  social_engineering: "Manipulation tactics to extract information or money",
  market_manipulation: "Insider trading, price fixing, or market fraud",
  labor_exploitation: "Unfair labor practices or human trafficking",
  hate_speech: "Content promoting violence or hatred against groups",
};

// Regex patterns for Layer A rule engine (pre-compiled in runtime)
export const FORBIDDEN_PATTERN_REGEX: Record<ForbiddenPatternName, string> = {
  surveillance:
    "\\b(surveillance|spy|monitor.*people|track.*citizens|wiretap|camera.*watch|stalk|monitor.*location)\\b",
  weapons:
    "\\b(weapon|gun|firearm|explosive|bomb|ammunition|arsenal|grenade|rifle|pistol|assault)\\b",
  political_manipulation:
    "\\b(political.*campaign|elect.*candidate|vote.*manipulation|propaganda|partisan|ballot.*stuff|voter.*suppress)\\b",
  financial_exploitation:
    "\\b(pyramid.*scheme|ponzi|scam|fraud|predatory.*len|multi.*level.*market|mlm|get.*rich.*quick)\\b",
  discrimination:
    "\\b(discriminat.*against|segregat|exclude.*based.*on|ban.*(race|religion|gender|orientation|disability))\\b",
  pseudo_science:
    "\\b(miracle.*cure|anti.*vax|vaccine.*danger|crystal.*heal|homeopath.*cure|essential.*oil.*cure)\\b",
  privacy_violation:
    "\\b(collect.*personal.*data|share.*private.*info|dox|publish.*address|leak.*contact)\\b",
  deepfakes:
    "\\b(deepfake|fake.*video|manipulated.*image|synthetic.*media.*deceive|ai.*generated.*fake)\\b",
  social_engineering:
    "\\b(phish|social.*engineer|impersonat.*official|fake.*charity|donation.*scam)\\b",
  market_manipulation:
    "\\b(insider.*trad|price.*fix|market.*manipul|pump.*and.*dump|stock.*fraud)\\b",
  labor_exploitation:
    "\\b(child.*labor|human.*traffick|forced.*labor|sweatshop|exploit.*worker|slave.*labor)\\b",
  hate_speech:
    "\\b(hate.*speech|incite.*violence|ethnic.*cleansing|genocide|lynch|supremac(y|ist))\\b",
};
