"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
function buildPrompt(context) {
    let prompt = `
You are a senior ${context.language} developer.

TASK:
Continue the code.

RULES:
- output ONLY code
- no explanations
- do not repeat existing code

CODE:
${context.prefix}

CONTEXT:
${context.window}
`;
    // Add repository context if available
    if (context.repoContext && context.repoContext.files.length > 0) {
        prompt += `
REPOSITORY FILES (for context):
The following files are from the same repository and may be relevant:
`;
        // Add a few sample files to provide broader context
        const sampleFiles = context.repoContext.files.slice(0, 3); // Limit to first 3 files
        sampleFiles.forEach((file, index) => {
            prompt += `
File ${index + 1}: ${file.path}
Language: ${file.language}
Content:
${file.content.substring(0, 1000)}... // truncated for brevity
`;
        });
    }
    return prompt;
}
//# sourceMappingURL=smartPrompt.js.map