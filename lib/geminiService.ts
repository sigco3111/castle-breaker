
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { LevelConfiguration, BlockConfig, BlockShape } from '../types'; // Adjust path as needed

const LOCAL_STORAGE_API_KEY_ID = 'dominoCastleGeminiApiKey';

let ai: GoogleGenAI | null = null;
let geminiInitializationError: string | null = null;

function getApiKey(): string | null {
  const envApiKey = (typeof process !== 'undefined' && process.env && process.env.API_KEY) ? process.env.API_KEY : null;
  if (envApiKey) {
    return envApiKey;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(LOCAL_STORAGE_API_KEY_ID);
  }
  return null;
}

export function initializeAiClient() {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      if (apiKey.trim() === "") {
        throw new Error("API 키가 비어있습니다.");
      }
      ai = new GoogleGenAI({ apiKey: apiKey });
      geminiInitializationError = null; 
      console.log("Gemini AI client initialized successfully.");
    } catch (e: any) {
      console.error("Failed to initialize GoogleGenAI with API Key:", e);
      geminiInitializationError = `Gemini AI 초기화 실패: ${e.message || String(e)}. API 키가 올바른지, 비어있지 않은지 확인하세요.`;
      ai = null;
    }
  } else {
    geminiInitializationError = "Gemini API 키를 찾을 수 없습니다. 레벨 에디터에서 설정하거나 process.env.API_KEY를 확인하세요.";
    ai = null;
  }
}

// Initialize on module load
initializeAiClient();

export function getGeminiStatus(): { isActive: boolean; message: string } {
  if (ai) {
    return { isActive: true, message: "Gemini API 활성됨" };
  }
  return { 
    isActive: false, 
    message: geminiInitializationError || "Gemini API 비활성. API 키를 설정하거나 확인하세요." 
  };
}


function buildPrompt(userThemePrompt?: string): string {
  return `
You are an expert level designer for a 3D physics-based game called "Domino Castle".
Your task is to generate a level configuration in JSON format.
The player shoots projectiles to knock over blocks. One block is the "golden block" (isKing: true), which must be toppled to win.
The ABSOLUTE PRIMARY GOAL is to ensure the generated structure is physically stable AT THE START OF THE GAME. It must not collapse on its own. It should only topple when hit by projectiles.

Output a single JSON object matching the following TypeScript interface structure:

interface LevelConfiguration {
  levelId: string; // Generate a unique string ID, e.g., "ai_level_timestamp_random"
  name: string; // A creative name for the level, e.g., "The Wobbly Spire", "Ancient Guard Post"
  initialProjectiles: number; // A reasonable number, e.g., between 3 and 15
  structure: BlockConfig[]; // Array of blocks
  gameMessage?: string; // Optional: A short, fun message for the start of the level.
  // DO NOT include cameraPosition or cameraTarget; they will be auto-calculated by the editor.
}

interface BlockConfig {
  id: string; // Generate a unique string ID for each block, e.g., "block_uuid_1"
  x: number; // GEOMETRIC CENTER x coordinate. Grid units are based on BLOCK_SIZE = 1.
  y: number; // GEOMETRIC CENTER y coordinate. Ground is at y=0. See PLACEMENT RULES.
  z: number; // GEOMETRIC CENTER z coordinate. Grid units are based on BLOCK_SIZE = 1.
  shape?: 'cube' | 'cylinder' | 'sphere' | 'cube_2x1x1' | 'cube_3x1x1'; // Default to 'cube'. 'cube_2x1x1' is 2 units long on X. 'cube_3x1x1' is 3 units long on X. All shapes have a height of BLOCK_SIZE (1 unit).
  isKing?: boolean; // Exactly ONE block in the structure must have isKing: true. This is the golden block.
  color?: number; // Optional: The DECIMAL (base 10) integer equivalent of a hex color code. E.g., for green (hex 0x4ade80), use its decimal value 5234208. If isKing is true, this color is ignored (it will be golden).
}

CRITICAL PLACEMENT AND STABILITY RULES (MUST BE FOLLOWED PRECISELY):

1.  BLOCK_SIZE IS 1 UNIT:
    *   All calculations for coordinates and stacking MUST assume BLOCK_SIZE = 1.
    *   All block shapes ('cube', 'cylinder', 'sphere', 'cube_2x1x1', 'cube_3x1x1') have a HEIGHT of 1 unit (BLOCK_SIZE).

2.  NO OVERLAP (EXTREMELY IMPORTANT):
    *   Blocks MUST NOT, under any circumstances, interpenetrate or overlap. EVEN SLIGHTLY.
    *   They can ONLY touch at their surfaces.
    *   The physics engine will apply strong separation forces to ANY overlapping blocks, causing IMMEDIATE COLLAPSE.
    *   Ensure all x, y, z coordinates are chosen such that blocks are adjacent or stacked, NEVER overlapping.

3.  Y-COORDINATE IS GEOMETRIC CENTER (EXTREMELY IMPORTANT):
    *   The 'y' value for a block is its GEOMETRIC CENTER, not its bottom.
    *   Ground Plane: The ground is at y=0.
    *   Ground Placement: ANY block (regardless of shape) placed directly on the ground MUST have its center y-coordinate EXACTLY at \`BLOCK_SIZE / 2\`. Since BLOCK_SIZE=1, this means \`y: 0.5\`. NO OTHER VALUE IS ACCEPTABLE FOR GROUNDED BLOCKS.
    *   Stacking: When stacking block B directly on top of block A:
        *   The GEOMETRIC CENTER y-coordinate of block B MUST be EXACTLY \`center_y_of_block_A + BLOCK_SIZE\`.
        *   Since BLOCK_SIZE=1, this means \`y_block_B = y_block_A + 1.0\`.
        *   Example:
            *   Block A on ground: \`y: 0.5\`.
            *   Block B on Block A: \`y: 1.5\`.
            *   Block C on Block B: \`y: 2.5\`. And so on.
        *   ANY DEVIATION from this precise y-coordinate calculation for stacked blocks WILL cause instability and likely immediate collapse.
    *   No Part Below Ground: No part of any block should ever be below y=0. This means the lowest point of any block must be >= 0. Given y is the center and height is 1, the center y must always be >= 0.5.

4.  STABLE SUPPORT (CRITICAL):
    *   Structures MUST be stable at the start. Avoid configurations that would collapse under gravity BEFORE being hit.
    *   Stacked blocks MUST have substantial horizontal overlap (support) from the block(s) beneath them.
    *   DO NOT balance blocks on single points or tiny/narrow edges. This WILL lead to immediate collapse.
    *   For 'cube_2x1x1' (length 2 along X) and 'cube_3x1x1' (length 3 along X), be mindful of their larger X-dimension footprint. Ensure their center x, y, z coordinates and the support they receive (or provide) account for their full size to maintain stability.

GENERAL GUIDELINES:
*   Level Grid: Design within coordinates approximately -10 to +10 for x and z. Max height (center y) around 10-12 units.
*   MAXIMUM Number of Blocks (CRITICAL CONSTRAINT): ABSOLUTELY NO MORE THAN 25 blocks. Recommended range is 5-25 blocks. Generating significantly more than 25 blocks WILL result in a truncated and unusable JSON response from the API. Adherence to this limit is ESSENTIAL.
*   JSON Length: The generated JSON MUST be concise. Excessively large structures (even within the block limit if descriptions are too verbose) can also be truncated and fail. Prioritize creative design within the block limit over sheer size or overly detailed names/messages.
*   Golden Block: Exactly ONE block MUST have \`isKing: true\`. This block should be topple-able but not so fragile it falls on its own. Ensure it's stably placed according to the Y-coordinate and support rules.
*   IDs: \`levelId\` and \`block.id\` must be unique strings. Keep them concise.
*   Coordinate Snapping: For x and z, try to use multiples of 0.5 or 1.0 for easier grid alignment. Y-coordinates are STRICTLY determined by the ground placement (0.5) or stacking (y_lower + 1.0) rules.
*   Colors: If assigning colors (other than the golden block), use the DECIMAL (base 10) integer value of the hex color code. (e.g., green 0x4ade80 -> decimal 5234208).
*   Shapes: Use a variety of shapes if it makes sense. Default to 'cube'. All shapes have height = 1.
*   Name: Level name should be creative and relatively short. English first, then Korean in parentheses if possible, e.g., "The Fortress (요새)".
*   Initial Projectiles: Between 3 and 15.

JSON SYNTAX RULES (Strictly Enforced):
*   The entire output MUST be a single, valid JSON object.
*   Use DOUBLE QUOTES for all keys and all string values.
*   Numbers in standard decimal format.
*   NO trailing commas.
*   NO comments (// or /* */) within the JSON.

User's theme or specific request: "${userThemePrompt || 'A fun, challenging, and creative level structure that is ABSOLUTELY STABLE at the start and does not collapse on its own.'} IMPORTANT: Remember to keep the total number of blocks STRICTLY between 5 and 25 blocks due to API response size limits."

MENTAL PRE-GENERATION STABILITY CHECK (Perform this before outputting JSON!):
1.  Y-Coordinates: Is EVERY block's 'y' coordinate PRECISELY 0.5 (if on ground) OR (y_of_block_below + 1.0) (if stacked)? (REMEMBER Y IS CENTER)
2.  Overlaps: Are there ANY (even tiny) overlaps or interpenetrations between ANY blocks? (MUST BE ZERO OVERLAPS)
3.  Support: Is every block (especially the Golden Block) adequately supported? No teetering on edges?
4.  Ground Boundary: Is every part of every block at or above y=0? (i.e., center y >= 0.5 for all blocks)
5.  Block Count: Is the total number of blocks 25 OR LESS? (CRITICAL)

Generate the JSON output now. Ensure the output is ONLY the JSON object, without any surrounding text or markdown.
The JSON must be well-formed and adhere strictly to ALL rules above, especially stability, placement, and block count.
The 'structure' should not be empty and contain 5-25 blocks.
Let's make an interesting and, above all, STABLE and CONCISE level!
`;
}


export async function generateLevelWithGemini(userPrompt?: string): Promise<LevelConfiguration> {
  if (!ai) {
    console.log("Gemini AI client not available or not initialized. Attempting to initialize now...");
    initializeAiClient(); 
  }

  if (!ai) { 
    const errorMsg = geminiInitializationError || "Gemini API key not configured. Please set it in the Level Editor or ensure process.env.API_KEY is available.";
    console.error("generateLevelWithGemini:", errorMsg);
    throw new Error(errorMsg);
  }

  let jsonString = ""; 
  const modelName = 'gemini-2.5-flash-preview-04-17';

  try {
    const fullPrompt = buildPrompt(userPrompt);
    const genAIResponse: GenerateContentResponse = await ai.models.generateContent({ 
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    
    if (genAIResponse.promptFeedback) {
        if (genAIResponse.promptFeedback.blockReason) {
            const blockReason = genAIResponse.promptFeedback.blockReason;
            let safetyRatingsDetails = 'N/A';
            if (genAIResponse.promptFeedback.safetyRatings && genAIResponse.promptFeedback.safetyRatings.length > 0) {
                safetyRatingsDetails = genAIResponse.promptFeedback.safetyRatings
                    .map(sr => `Category: ${sr.category}, Probability: ${sr.probability}`)
                    .join('; ');
            }
            throw new Error(`AI generation failed due to content blocking. Reason: ${blockReason}. Safety ratings: [${safetyRatingsDetails}]`);
        }
    }
    
    const textOutput = genAIResponse.text;

    if (textOutput === undefined || textOutput === null) {
        console.error("Gemini API returned undefined or null for text output. Full response object:", JSON.stringify(genAIResponse, null, 2));
        let candidateDetails = "Details from candidates: ";
        if (genAIResponse.candidates && genAIResponse.candidates.length > 0) {
            const firstCandidate = genAIResponse.candidates[0];
            candidateDetails += `Finish Reason: ${firstCandidate.finishReason || 'N/A'}. `;
            if (!firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
                candidateDetails += "First candidate had no content parts.";
            } else {
                 candidateDetails += `First candidate had ${firstCandidate.content.parts.length} part(s).`;
            }
        } else {
             candidateDetails = "No candidates in response.";
        }
        throw new Error(`AI returned no text output (undefined or null). ${candidateDetails} This can happen if the model cannot fulfill the request (e.g., to output JSON) or if the prompt is problematic.`);
    }

    if (typeof textOutput !== 'string') {
        console.error("Gemini API returned a non-string text output. Type:", typeof textOutput, "Full response object:", JSON.stringify(genAIResponse, null, 2));
        throw new Error(`AI returned an unexpected non-string type for text output: ${typeof textOutput}.`);
    }

    jsonString = textOutput.trim();
    
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonString.match(fenceRegex);
    if (match && match[2]) {
      jsonString = match[2].trim();
    }
    
    if (jsonString.length === 0) { 
        console.error("Gemini response resulted in an empty string after processing. Original text output (before trim/fence removal):", textOutput);
        throw new Error("AI returned an empty JSON string. Please try a different prompt or check the console.");
    }
    if (jsonString.toLowerCase().includes("error") && (jsonString.toLowerCase().includes("sorry") || jsonString.toLowerCase().includes("unable to"))) { 
        console.error("Gemini response appears to be an error message or apology:", jsonString);
        throw new Error(`AI did not return valid JSON. It might have returned an error message or apology: "${jsonString.substring(0,100)}..."`);
    }
     if (!jsonString.startsWith("{") || !jsonString.endsWith("}")) {
        const snippet = jsonString.length > 200 ? `${jsonString.substring(0, 100)}... (content length: ${jsonString.length}) ...${jsonString.substring(jsonString.length - 100)}` : jsonString;
        console.error("Processed Gemini response is not a valid JSON structure (does not start with '{' and/or end with '}'). Snippet:", snippet, "Full length:", jsonString.length);
        let specificError = "AI did not return a valid JSON structure.";
        if (jsonString.startsWith("{") && !jsonString.endsWith("}")) {
            specificError = "AI returned JSON that starts with '{' but does not end with '}'. This often indicates the response was TRUNCATED due to excessive length. Ensure the AI adheres to block count limits (MAX 25 blocks) and general conciseness.";
        } else if (!jsonString.startsWith("{") && jsonString.endsWith("}")) {
            specificError = "AI returned JSON that ends with '}' but does not start with '{'. This indicates an issue with the start of the JSON structure.";
        } else if (jsonString.length > 0 && !jsonString.startsWith("{") && !jsonString.endsWith("}")) {
            specificError = "AI returned text that is not a JSON structure (neither starts with '{' nor ends with '}').";
        }
        throw new Error(specificError);
    }

    const parsedData = JSON.parse(jsonString);

    if (!parsedData.name || !Array.isArray(parsedData.structure) || typeof parsedData.initialProjectiles !== 'number') {
      console.error("Parsed Gemini response missing essential fields:", parsedData);
      throw new Error("AI-generated level data is missing required fields (name, structure, initialProjectiles).");
    }
    if (parsedData.structure.length > 25 || parsedData.structure.length < 1) { 
      console.warn(`AI generated ${parsedData.structure.length} blocks, which is outside the 1-25 limit. Prompt needs further refinement or AI ignored constraints.`);
      if (parsedData.structure.length > 25) {
        throw new Error(`AI generated ${parsedData.structure.length} blocks, exceeding the maximum limit of 25. Please try a more constrained prompt.`);
      }
       if (parsedData.structure.length === 0) {
        throw new Error("AI-generated level structure cannot be empty.");
      }
    }
    if (parsedData.structure.filter((b: BlockConfig) => b.isKing).length !== 1) {
      throw new Error("AI-generated level must have exactly one golden block. The generated structure did not meet this requirement.");
    }

    parsedData.structure.forEach((block: BlockConfig, index: number) => {
        if (!block.id) {
            block.id = `ai_block_${Date.now()}_${index}`;
        }
        if (block.color && typeof block.color === 'string') {
            const parsedColor = parseInt(block.color, 10); 
            if (isNaN(parsedColor)) {
                const hexParsedColor = parseInt(block.color, 16);
                if(isNaN(hexParsedColor)) delete block.color; else block.color = hexParsedColor;
            } else {
                 block.color = parsedColor;
            }
        }
        if (!block.shape) {
            block.shape = 'cube';
        }
    });

    if (!parsedData.levelId) {
        parsedData.levelId = `ai_level_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    return parsedData as LevelConfiguration;

  } catch (error: any) {
    console.error("Error generating level with Gemini:", error.message);
    if (error instanceof SyntaxError || (error.message && error.message.toLowerCase().includes("json"))) {
        const loggableJsonString = jsonString.length > 1000 ? `${jsonString.substring(0, 500)}... (TRUNCATED FOR LOG) ...${jsonString.substring(jsonString.length - 500)}` : jsonString;
        console.error("Problematic JSON string that caused parsing error (if available, potentially truncated for log):\n", loggableJsonString); 
        throw new Error(`Failed to parse AI response as JSON. The AI may have returned malformed data. Details: ${error.message}`);
    }
    throw new Error(`AI level generation failed: ${error.message || String(error)}`);
  }
}
