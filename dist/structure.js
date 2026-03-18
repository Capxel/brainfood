import { normalizeUrl, packageVersion, sentenceSummary, shortHash } from './utils.js';
const STOPWORDS = new Set([
    'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'being',
    'between', 'both', 'but', 'by', 'can', 'could', 'do', 'does', 'for', 'from', 'get', 'had', 'has', 'have', 'how',
    'if', 'in', 'into', 'is', 'it', 'its', 'may', 'more', 'most', 'new', 'not', 'of', 'on', 'or', 'our', 'out', 'over',
    'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'to',
    'up', 'use', 'using', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'you', 'your'
]);
const ENTITY_NOISE_WORDS = new Set([
    'about', 'after', 'also', 'based', 'before', 'between', 'could', 'each', 'every', 'first', 'found', 'great',
    'however', 'known', 'large', 'makes', 'many', 'most', 'never', 'often', 'other', 'several', 'since', 'small',
    'such', 'through', 'three', 'together', 'under', 'upon', 'very', 'what', 'where', 'which', 'while', 'within',
    'without'
]);
const CONNECTOR_WORDS = new Set(['and', 'at', 'for', 'in', 'of', 'on', 'the']);
const GENERIC_ENTITY_TERMS = new Set([
    'agentic', 'architecture', 'attribute', 'behind', 'built', 'buyer', 'campaigns', 'can', 'capture', 'common',
    'consumer', 'data', 'difference', 'diagnostics', 'discovers', 'enrichment', 'every', 'explore', 'faq', 'fast',
    'fields', 'find', 'flagship', 'free', 'identity', 'industries', 'intelligence', 'layer', 'leaders', 'lifecycle',
    'make', 'most', 'native', 'opportunity', 'optimized', 'optimization', 'our', 'parse', 'platform', 'premium',
    'problem', 'product', 'resolution', 'say', 'search', 'second', 'see', 'signals', 'site', 'standard', 'started',
    'suite', 'talk', 'test', 'tool', 'traditional', 'trigger', 'visibility', 'we', 'where', 'workflow', 'your',
    'full', 'local', 'service'
]);
const ACRONYM_NOISE_WORDS = new Set(['CEO', 'CMO', 'CSV', 'FAQ', 'HTTP', 'HTTPS', 'ROI', 'SEO', 'URL']);
const PERSON_DISALLOWED_WORDS = new Set([
    'agentic', 'ai', 'based', 'brief', 'case', 'consumer', 'customer', 'data', 'digital', 'docx',
    'enterprise', 'explore', 'flagship', 'foundation', 'group', 'intelligence', 'internal', 'manual', 'operations',
    'optimization', 'overview', 'platform', 'product', 'program', 'retail', 'saas', 'search', 'smart', 'startup',
    'study', 'suite', 'team', 'texas', 'unification', 'university', 'visibility', 'work', 'full', 'identity', 'service', 'local'
]);
const LOCATION_TERMS = new Set([
    'avenue', 'bay', 'beach', 'borough', 'campus', 'canada', 'city', 'county', 'district', 'france', 'germany',
    'india', 'island', 'london', 'mountain', 'paris', 'road', 'state', 'street', 'texas', 'tokyo', 'united'
]);
const KNOWN_REGION_NAMES = new Set([
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'canada', 'colorado', 'florida', 'georgia', 'illinois',
    'india', 'london', 'massachusetts', 'new york', 'paris', 'texas', 'tokyo', 'united kingdom', 'united states',
    'washington'
]);
const INSTITUTION_TERMS = /(university|college|institute|school|foundation|association|society|academy|center|centre|museum|hospital|laboratory|lab|nonprofit|organisation|organization)/i;
const COMPANY_TERMS = /(inc|corp|corporation|llc|ltd|gmbh|company|co\.|group|technologies|technology|systems|solutions|labs?|studio|ventures|partners)/i;
const TYPE_SCORES = {
    institution: 6,
    company: 5,
    person: 4,
    product: 3,
    location: 2,
    topic: 1,
    unknown: 0
};
const PERSON_CONTEXT_PATTERNS = [
    '(?:by|with|from|according to|led by|founded by)\\s+%ENTITY%',
    '%ENTITY%\\s+(?:said|says|leads|led|joined|founded|wrote|presented|reviewed|works|served|authored|described|announced)',
    '(?:mr\\.?|mrs\\.?|ms\\.?|dr\\.?|ceo|cto|founder|president)\\s+%ENTITY%'
];
function normalizeEntityName(name) {
    return name
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+,/g, ',')
        .replace(/[.:;!?]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function normalizeEntityKey(name) {
    return normalizeEntityName(name).toLowerCase();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cleanEntityToken(token) {
    return token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9,.'&-]+$/g, '');
}
function isNoiseEntity(name) {
    const words = normalizeEntityName(name)
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.toLowerCase().replace(/,$/, ''));
    if (words.length === 0) {
        return true;
    }
    if (words.length === 1) {
        return STOPWORDS.has(words[0] || '') || ENTITY_NOISE_WORDS.has(words[0] || '');
    }
    if (new Set(words).size === 1) {
        return true;
    }
    return words.every((word) => STOPWORDS.has(word) || ENTITY_NOISE_WORDS.has(word));
}
function isSubstringOfTitle(name, title) {
    const normalizedName = normalizeEntityKey(name);
    const normalizedTitle = normalizeEntityKey(title);
    return normalizedName.length >= 3 && normalizedTitle.includes(normalizedName);
}
function hasContext(content, name, patterns) {
    const escaped = escapeRegExp(name);
    return patterns.some((pattern) => new RegExp(pattern.replace('%ENTITY%', escaped), 'i').test(content));
}
function isSimpleCapitalizedToken(token) {
    return /^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?[,]?$/.test(token);
}
function isAcronymToken(token) {
    const cleaned = token.replace(/,$/, '');
    return /^[A-Z]{2,}(?:-[A-Z0-9]+)*$/.test(cleaned) && !ACRONYM_NOISE_WORDS.has(cleaned);
}
function splitCamelParts(token) {
    return token.replace(/,$/, '').match(/[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+/g) || [];
}
function isSuspiciousMergedToken(token) {
    const parts = splitCamelParts(token);
    if (parts.length < 2) {
        return false;
    }
    const genericParts = parts.filter((part) => {
        const lower = part.toLowerCase();
        return GENERIC_ENTITY_TERMS.has(lower) || ENTITY_NOISE_WORDS.has(lower) || STOPWORDS.has(lower);
    }).length;
    return genericParts >= parts.length - 1;
}
function isCamelCaseToken(token) {
    return /^[A-Z][a-z]+[A-Z][A-Za-z]*[,]?$/.test(token) && !isSuspiciousMergedToken(token);
}
function isEntityLikeToken(token) {
    const cleaned = cleanEntityToken(token);
    return isSimpleCapitalizedToken(cleaned) || isAcronymToken(cleaned) || isCamelCaseToken(cleaned);
}
function isEntityStartToken(token) {
    const cleaned = cleanEntityToken(token);
    const lower = cleaned.toLowerCase().replace(/,$/, '');
    return Boolean(cleaned)
        && !CONNECTOR_WORDS.has(lower)
        && !STOPWORDS.has(lower)
        && !ENTITY_NOISE_WORDS.has(lower)
        && isEntityLikeToken(cleaned);
}
function isPersonWord(word) {
    const cleaned = word.replace(/,$/, '');
    return /^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?$/.test(cleaned)
        && !STOPWORDS.has(cleaned.toLowerCase())
        && !PERSON_DISALLOWED_WORDS.has(cleaned.toLowerCase());
}
function extractTopics(document) {
    const frequency = new Map();
    const corpus = `${document.title}\n${document.content}`.toLowerCase();
    const tokens = corpus.match(/[a-z][a-z0-9-]{2,}/g) || [];
    for (const token of tokens) {
        if (STOPWORDS.has(token)) {
            continue;
        }
        frequency.set(token, (frequency.get(token) || 0) + 1);
    }
    return [...frequency.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 8)
        .map(([topic]) => topic);
}
function classifyEntity(name, document, count) {
    const normalized = normalizeEntityName(name);
    const words = normalized.split(/\s+/).filter(Boolean);
    const significantWords = words.filter((word) => !CONNECTOR_WORDS.has(word.toLowerCase()));
    const lowerWords = significantWords.map((word) => word.toLowerCase().replace(/,$/, ''));
    if (normalized.length < 3
        || significantWords.length === 0
        || significantWords.length > 4
        || isNoiseEntity(normalized)
        || isSubstringOfTitle(normalized, document.title)) {
        return 'unknown';
    }
    const joined = words.join(' ');
    const genericWordCount = lowerWords.filter((word) => GENERIC_ENTITY_TERMS.has(word)).length;
    const commaParts = normalized.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    const hasLocationContext = hasContext(document.content, normalized, [
        '(?:based in|located in|headquartered in|offices in|from)\\s+%ENTITY%',
        '%ENTITY%\\s+(?:office|headquarters|campus)'
    ]);
    const hasCompanyContext = hasContext(document.content, normalized, [
        '%ENTITY%\\s+(?:is|was)?\\s*(?:a|an|the)?\\s*(?:company|startup|business)',
        '(?:company|startup|business)\\s+%ENTITY%',
        '(?:founded|acquired|built|launched)\\s+%ENTITY%'
    ]);
    const productTokenCount = significantWords.filter((word) => isAcronymToken(word) || isCamelCaseToken(word)).length;
    if (/^[A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+)*(?:,\s*[A-Z][A-Za-z.-]+)?$/.test(normalized)
        && ((commaParts.length === 2 && KNOWN_REGION_NAMES.has(commaParts[1] || '')) || hasLocationContext)
        && significantWords.length >= 2
        && significantWords.length <= 3) {
        return 'location';
    }
    if (INSTITUTION_TERMS.test(joined)) {
        return 'institution';
    }
    if (COMPANY_TERMS.test(joined)) {
        return 'company';
    }
    if (hasCompanyContext && significantWords.length <= 2 && genericWordCount === 0) {
        return 'company';
    }
    const productLike = significantWords.length === 1 && productTokenCount === 1;
    const singleProductToken = significantWords[0] || '';
    if ((productLike && genericWordCount === 0)) {
        if (document.sourceType !== 'local' && isCamelCaseToken(singleProductToken) && count < 2) {
            return 'unknown';
        }
        return 'product';
    }
    if (significantWords.length >= 2
        && significantWords.length <= 3
        && significantWords.every(isPersonWord)
        && hasContext(document.content, normalized, PERSON_CONTEXT_PATTERNS)) {
        return 'person';
    }
    return 'unknown';
}
function collectEntityCandidates(document) {
    const text = `${document.title}\n${document.content}`;
    const counts = new Map();
    const patterns = [
        /\b[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?(?:\s+(?:of|for|and|the|[A-Z][a-z]+)){0,3}\b/g,
        /\b(?:[A-Z]{2,6}(?:-[A-Z]{2,6})*|[A-Z][a-z]+[A-Z][A-Za-z]+)\b/g
    ];
    for (const pattern of patterns) {
        for (const match of text.match(pattern) || []) {
            const candidate = normalizeEntityName(match);
            if (!candidate || candidate.length > 48) {
                continue;
            }
            const significantWords = candidate.split(/\s+/).filter((word) => !CONNECTOR_WORDS.has(word.toLowerCase()));
            if (significantWords.length === 0 || significantWords.length > 4) {
                continue;
            }
            counts.set(candidate, (counts.get(candidate) || 0) + 1);
        }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
}
function dedupeEntities(entities) {
    const exact = new Map();
    for (const entity of entities) {
        const key = `${entity.type}:${normalizeEntityKey(entity.name)}`;
        const existing = exact.get(key);
        if (!existing || existing.name.length < entity.name.length) {
            exact.set(key, entity);
        }
    }
    return [...exact.values()].filter((entity, _, all) => {
        const normalized = normalizeEntityKey(entity.name);
        return !all.some((other) => {
            if (other === entity || other.type !== entity.type) {
                return false;
            }
            const otherNormalized = normalizeEntityKey(other.name);
            return otherNormalized.length > normalized.length && otherNormalized.includes(normalized);
        });
    });
}
function extractEntities(document, topics) {
    const primaryEntities = dedupeEntities(collectEntityCandidates(document)
        .map((candidate) => ({
        name: normalizeEntityName(candidate.name),
        type: classifyEntity(candidate.name, document, candidate.count),
        count: candidate.count
    }))
        .filter((candidate) => candidate.type !== 'unknown')
        .sort((left, right) => {
        return TYPE_SCORES[right.type] - TYPE_SCORES[left.type] || right.count - left.count || right.name.length - left.name.length;
    })
        .map((candidate) => ({ name: candidate.name, type: candidate.type })));
    const topicEntities = topics
        .slice(0, 4)
        .filter((topic) => !primaryEntities.some((entity) => normalizeEntityKey(entity.name) === topic.toLowerCase()))
        .map((topic) => ({ name: topic, type: 'topic' }));
    return [...primaryEntities, ...topicEntities].slice(0, 15);
}
function buildRelationships(document, sourceMap) {
    const relationships = [];
    const seenTargets = new Set();
    for (const link of document.discoveredLinks) {
        if (!link.absoluteUrl) {
            continue;
        }
        const normalizedTarget = normalizeUrl(link.absoluteUrl);
        const relatedNode = sourceMap.get(normalizedTarget);
        if (!relatedNode || seenTargets.has(relatedNode.id)) {
            continue;
        }
        seenTargets.add(relatedNode.id);
        relationships.push({
            type: 'links_to',
            target: relatedNode.id,
            targetTitle: relatedNode.title,
            weight: 1
        });
    }
    return relationships;
}
function buildTopicRelationships(nodes) {
    const relationships = new Map();
    for (const node of nodes) {
        relationships.set(node.id, []);
    }
    for (let index = 0; index < nodes.length; index += 1) {
        const left = nodes[index];
        const leftTopics = new Set(left.topics.map((topic) => topic.toLowerCase()));
        const leftEntities = new Set(left.entities
            .filter((entity) => entity.type !== 'topic')
            .map((entity) => `${entity.type}:${normalizeEntityKey(entity.name)}`));
        for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
            const right = nodes[otherIndex];
            const sharedTopics = right.topics.filter((topic) => leftTopics.has(topic.toLowerCase()));
            const sharedEntities = right.entities.filter((entity) => entity.type !== 'topic' && leftEntities.has(`${entity.type}:${normalizeEntityKey(entity.name)}`));
            if (sharedTopics.length < 2 && sharedEntities.length < 1) {
                continue;
            }
            const weight = sharedTopics.length + sharedEntities.length;
            relationships.get(left.id)?.push({
                type: 'related_to',
                target: right.id,
                targetTitle: right.title,
                weight
            });
            relationships.get(right.id)?.push({
                type: 'related_to',
                target: left.id,
                targetTitle: left.title,
                weight
            });
        }
    }
    return relationships;
}
function mergeRelationships(...groups) {
    const merged = new Map();
    for (const group of groups) {
        for (const relationship of group) {
            const key = `${relationship.type}:${relationship.target}`;
            const existing = merged.get(key);
            if (!existing || (relationship.weight || 0) > (existing.weight || 0)) {
                merged.set(key, relationship);
            }
        }
    }
    return [...merged.values()];
}
export function buildKnowledgeNodes(documents) {
    const generatedAt = new Date().toISOString();
    const baseNodes = documents.map((document) => {
        const topics = extractTopics(document);
        const entities = extractEntities(document, topics);
        return {
            id: shortHash(document.canonicalSource),
            title: document.title,
            url: document.url,
            source: document.source,
            content: document.content,
            summary: sentenceSummary(document.content) || document.excerpt,
            topics,
            entities,
            relationships: [],
            metadata: {
                sourceType: document.sourceType,
                canonicalSource: document.canonicalSource,
                relativeOutputPath: document.relativeOutputPath,
                contentType: document.contentType,
                statusCode: document.statusCode,
                wordCount: document.wordCount,
                language: document.language,
                author: document.author,
                publishedAt: document.publishedAt,
                lastModified: document.lastModified,
                generatedAt
            }
        };
    });
    const sourceMap = new Map();
    for (const node of baseNodes) {
        sourceMap.set(node.metadata.canonicalSource, node);
        if (node.url) {
            sourceMap.set(normalizeUrl(node.url), node);
        }
    }
    const topicalRelationships = buildTopicRelationships(baseNodes);
    return baseNodes.map((node, index) => ({
        ...node,
        relationships: mergeRelationships(buildRelationships(documents[index], sourceMap), topicalRelationships.get(node.id) || [])
    }));
}
export function buildKnowledgeGraph(sourceType, sourceRoot, nodes) {
    const topicSet = new Set();
    const entitySet = new Set();
    let relationshipCount = 0;
    for (const node of nodes) {
        for (const topic of node.topics) {
            topicSet.add(topic);
        }
        for (const entity of node.entities) {
            if (entity.type === 'topic') {
                continue;
            }
            entitySet.add(`${entity.type}:${entity.name}`);
        }
        relationshipCount += node.relationships.length;
    }
    return {
        '@context': ['https://schema.org', 'https://llmld.org/'],
        tool: {
            name: 'brainfood',
            brand: 'brainfood',
            website: 'https://github.com/Capxel/brainfood',
            version: packageVersion()
        },
        generatedAt: new Date().toISOString(),
        sourceType,
        sourceRoot,
        stats: {
            documentCount: nodes.length,
            relationshipCount,
            topicCount: topicSet.size,
            entityCount: entitySet.size
        },
        nodes
    };
}
//# sourceMappingURL=structure.js.map