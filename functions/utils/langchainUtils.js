/**
 * LangChain Wrapper Utilities
 *
 * Provides high-level wrappers around LangChain for common patterns:
 * - Simple one-shot chains with prompt templates
 * - Structured JSON output chains
 * - Safe JSON parsing with error handling
 * - Token counting and retry logic
 *
 * @module functions/utils/langchainUtils
 */

const {ChatOpenAI} = require("@langchain/openai");
const {PromptTemplate} = require("@langchain/core/prompts");
const {LLMChain} = require("langchain/chains");
const {StructuredOutputParser} = require("langchain/output_parsers");
const {estimateTokenCount, sleep, AIServiceError} = require("./aiUtils");

/**
 * Create a simple LLM chain with prompt template
 *
 * @param {string} templateString - Prompt template with {variables}
 * @param {Object} [options] - Chain configuration options
 * @param {string} [options.model="gpt-4o-mini"] - Model name
 * @param {number} [options.temperature=0.3] - Temperature (0-2)
 * @param {number} [options.maxTokens=2000] - Max completion tokens
 * @param {number} [options.retries=3] - Number of retry attempts
 * @return {Object} Chain object with invoke() method
 * @throws {AIServiceError} If chain creation fails
 *
 * @example
 * const chain = createSimpleChain(
 *   "Summarize this conversation:\n\n{context}\n\nSummary:",
 *   {temperature: 0.3, maxTokens: 500}
 * );
 * const result = await chain.invoke({context: "..."});
 */
function createSimpleChain(templateString, options = {}) {
  if (!templateString || typeof templateString !== "string") {
    throw new AIServiceError(
        "templateString must be a non-empty string",
        400,
        "INVALID_TEMPLATE",
    );
  }

  const {
    model = "gpt-4o-mini",
    temperature = 0.3,
    maxTokens = 2000,
    retries = 3,
  } = options;

  try {
    // Get API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIServiceError(
          "OpenAI API key not found",
          500,
          "MISSING_API_KEY",
      );
    }

    // Initialize ChatOpenAI model
    const llm = new ChatOpenAI({
      modelName: model,
      temperature: temperature,
      maxTokens: maxTokens,
      openAIApiKey: apiKey,
      maxRetries: retries,
      timeout: 60000, // 60 second timeout
    });

    // Create prompt template
    const prompt = PromptTemplate.fromTemplate(templateString);

    // Create chain
    const chain = new LLMChain({
      llm: llm,
      prompt: prompt,
    });

    // Log chain creation in development
    if (process.env.NODE_ENV === "development") {
      console.log("[LangChain] Simple chain created:", {
        model,
        temperature,
        maxTokens,
      });
    }

    return chain;
  } catch (error) {
    if (error instanceof AIServiceError) {
      throw error;
    }
    throw new AIServiceError(
        `Failed to create LangChain: ${error.message}`,
        500,
        "CHAIN_CREATION_ERROR",
    );
  }
}

/**
 * Create a structured output chain that returns parsed JSON
 *
 * @param {Object} schema - Zod schema or output parser schema
 * @param {string} promptTemplate - Prompt template string
 * @param {Object} [options] - Chain configuration options
 * @return {Object} Chain with invoke() returning parsed JSON
 * @throws {AIServiceError} If schema or chain creation fails
 *
 * @example
 * const chain = createStructuredOutputChain(
 *   {priorities: [{messageId: "string", priority: "string"}]},
 *   "Analyze these messages:\n{context}\n\n{format_instructions}"
 * );
 * const result = await chain.invoke({context: "..."});
 */
function createStructuredOutputChain(schema, promptTemplate, options = {}) {
  if (!schema || typeof schema !== "object") {
    throw new AIServiceError(
        "schema must be a valid object",
        400,
        "INVALID_SCHEMA",
    );
  }

  if (!promptTemplate || typeof promptTemplate !== "string") {
    throw new AIServiceError(
        "promptTemplate must be a non-empty string",
        400,
        "INVALID_TEMPLATE",
    );
  }

  const {
    model = "gpt-4o-mini",
    temperature = 0.3,
    maxTokens = 2000,
    retries = 3,
  } = options;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIServiceError(
          "OpenAI API key not found",
          500,
          "MISSING_API_KEY",
      );
    }

    // Initialize model
    const llm = new ChatOpenAI({
      modelName: model,
      temperature: temperature,
      maxTokens: maxTokens,
      openAIApiKey: apiKey,
      maxRetries: retries,
      timeout: 60000,
    });

    // Create output parser from schema
    const parser = StructuredOutputParser.fromNamesAndDescriptions(schema);

    // Inject format instructions into prompt template
    const formatInstructions = parser.getFormatInstructions();
    const fullPrompt = PromptTemplate.fromTemplate(
        promptTemplate,
    );

    // Create chain with parser
    const chain = new LLMChain({
      llm: llm,
      prompt: fullPrompt,
      outputParser: parser,
    });

    // Wrap invoke to handle parsing errors
    const originalInvoke = chain.invoke.bind(chain);
    chain.invoke = async (input) => {
      try {
        // Add format instructions to input
        const result = await originalInvoke({
          ...input,
          format_instructions: formatInstructions,
        });
        return result;
      } catch (error) {
        if (error.message?.includes("parse") ||
            error.message?.includes("JSON")) {
          throw new AIServiceError(
              "Failed to parse structured output",
              500,
              "PARSE_ERROR",
          );
        }
        throw error;
      }
    };

    return chain;
  } catch (error) {
    if (error instanceof AIServiceError) {
      throw error;
    }
    throw new AIServiceError(
        `Failed to create structured chain: ${error.message}`,
        500,
        "CHAIN_CREATION_ERROR",
    );
  }
}

/**
 * Safely parse JSON response with fallback and validation
 *
 * @param {string} text - JSON text to parse
 * @param {Object} [options] - Parsing options
 * @param {*} [options.fallback=null] - Fallback value on error
 * @param {boolean} [options.throwOnError=true] - Throw or return fallback
 * @return {Object|null} Parsed JSON or fallback
 * @throws {AIServiceError} If parsing fails and throwOnError=true
 *
 * @example
 * const data = parseJSONResponse('{"key": "value"}');
 * const safe = parseJSONResponse('invalid', {
 *   fallback: {},
 *   throwOnError: false
 * });
 */
function parseJSONResponse(text, options = {}) {
  const {fallback = null, throwOnError = true} = options;

  if (!text || typeof text !== "string") {
    if (throwOnError) {
      throw new AIServiceError(
          "text must be a non-empty string",
          400,
          "INVALID_INPUT",
      );
    }
    return fallback;
  }

  try {
    // Trim whitespace and common AI prefixes
    let cleaned = text.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    // Parse JSON
    const parsed = JSON.parse(cleaned);

    return parsed;
  } catch (error) {
    if (throwOnError) {
      throw new AIServiceError(
          `Failed to parse JSON: ${error.message}`,
          400,
          "JSON_PARSE_ERROR",
      );
    }
    return fallback;
  }
}

/**
 * Invoke a chain with automatic retry logic
 *
 * @param {Object} chain - LangChain chain instance
 * @param {Object} input - Input variables for chain
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxRetries=3] - Max retry attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms
 * @return {Promise<Object>} Chain result
 * @throws {AIServiceError} If all retries fail
 *
 * @example
 * const result = await invokeWithRetry(chain, {context: "..."},
 *   {maxRetries: 3}
 * );
 */
async function invokeWithRetry(chain, input, options = {}) {
  const {maxRetries = 3, baseDelay = 1000} = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await chain.invoke(input);
      return result;
    } catch (error) {
      lastError = error;

      // Don't retry on validation errors (400-level)
      if (error.statusCode && error.statusCode >= 400 &&
          error.statusCode < 500) {
        throw error;
      }

      // Calculate exponential backoff delay
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
            `[LangChain] Retry ${attempt + 1}/${maxRetries} ` +
            `after ${delay}ms:`,
            error.message,
        );
        await sleep(delay);
      }
    }
  }

  // All retries failed
  throw new AIServiceError(
      `Chain invoke failed after ${maxRetries} retries: ${lastError.message}`,
      500,
      "CHAIN_INVOKE_ERROR",
  );
}

/**
 * Count tokens in text (reuses aiUtils estimator)
 *
 * @param {string} text - Text to count
 * @return {number} Estimated token count
 */
function tokenCount(text) {
  return estimateTokenCount(text);
}

// Export all utilities
module.exports = {
  createSimpleChain,
  createStructuredOutputChain,
  parseJSONResponse,
  invokeWithRetry,
  tokenCount,
};

