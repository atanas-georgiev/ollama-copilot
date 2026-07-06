export async function streamOllama(
    prompt: string,
    onToken: (t: string) => void,
    model: string,
    baseUrl: string
) {
    const apiStartTime = Date.now();
    console.log(`[OllamaCopilot] API request to ${baseUrl}/api/chat`);
    console.log(`[OllamaCopilot] Model: ${model}`);

    let errorMessage = "";
    try {
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                stream: true,
                messages: [
                    {
                        role: "system",
                        content: "You are a code completion engine. Output only code."
                    },
                    { role: "user", content: prompt }
                ]
            })
        });

        const connectTime = Date.now() - apiStartTime;
        console.log(`[OllamaCopilot] API connected in ${connectTime}ms, status: ${res.status}`);

        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`HTTP ${res.status}: ${errorBody}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
            console.warn("[OllamaCopilot] No reader available from response");
            return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let tokenCount = 0;
        let totalTokens = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const json = JSON.parse(line);
                    const token = json.message?.content;
                    if (token) {
                        tokenCount++;
                        totalTokens += token;
                        onToken(token);
                    }
                } catch (parseError) {
                    console.warn(`[OllamaCopilot] Failed to parse line: ${line}`);
                }
            }
        }

        const totalTime = Date.now() - apiStartTime;
        console.log(
            `[OllamaCopilot] API complete - ${tokenCount} tokens, ${totalTokens.length} chars in ${totalTime}ms`
        );
    } catch (error) {
        const totalTime = Date.now() - apiStartTime;
        console.error(
            `[OllamaCopilot] API error after ${totalTime}ms:`,
            error instanceof Error ? error.message : String(error)
        );
        errorMessage = error instanceof Error ? error.message : String(error);
    }

    if (errorMessage) {
        onToken(`[Error: ${errorMessage}]`);
    }
}
