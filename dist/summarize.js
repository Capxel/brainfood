import fetch from 'node-fetch';
import { sentenceSummary } from './utils.js';
async function openAiSummary(request, model) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required when --summarize is enabled.');
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            input: [
                {
                    role: 'system',
                    content: [
                        {
                            type: 'input_text',
                            text: 'Summarize the document for an AI knowledge graph in 2 concise sentences. Return plain text only.'
                        }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: `Title: ${request.title}\n\nContent:\n${request.content.slice(0, 8000)}`
                        }
                    ]
                }
            ]
        })
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI summary request failed (${response.status}): ${body}`);
    }
    const payload = (await response.json());
    return payload.output_text?.trim() || request.fallback || sentenceSummary(request.content) || '';
}
export async function generateSummary(request, enabled, model) {
    const fallback = request.fallback || sentenceSummary(request.content);
    if (!enabled) {
        return fallback;
    }
    try {
        return await openAiSummary(request, model);
    }
    catch {
        return fallback;
    }
}
//# sourceMappingURL=summarize.js.map