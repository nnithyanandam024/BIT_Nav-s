// AI NLP Engine for Campus Navigation
// Supports Google Gemini API + Offline Semantic Fallback

export async function processNaturalLanguageQuery(query, landmarks, apiKey = null) {
  const trimmed = query.trim();

  // Try Google Gemini API if key is present
  if (apiKey) {
    try {
      const geminiResult = await callGeminiLLM(trimmed, landmarks, apiKey);
      if (geminiResult && geminiResult.intent) {
        return geminiResult;
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local NLP engine:', err.message);
    }
  }

  // Built-in Deterministic Semantic Understanding Engine
  return localSemanticParse(trimmed, landmarks);
}

// Call Google Gemini API
async function callGeminiLLM(query, landmarks, apiKey) {
  const landmarkList = landmarks.map(l => ({
    id: l.id,
    name: l.name,
    category: l.category,
    type: l.type,
    aliases: l.aliases
  }));

  const systemInstruction = `You are the AI Campus Navigation Assistant for Bannari Amman Institute of Technology (BIT), Sathyamangalam (HACKSPACE 2026).
Your job is to understand natural language user queries about campus navigation and return a structured JSON response.

Verified Campus Locations:
${JSON.stringify(landmarkList, null, 2)}

Identify the user's intent and extract entities:
- "intent": One of ["navigate", "nearest_facility", "find_place", "list_facilities", "campus_info"]
- "source": The ID of the source location if mentioned (e.g. "main_gate", "central_library"), or null
- "destination": The ID of the destination location if mentioned, or null
- "facility_type": If asking for nearest or list, the type/category (e.g. "computer_lab", "canteen", "atm", "hostel", "sports", "medical", "library", "auditorium")
- "preference": "fastest", "nearest", or "accessible"
- "conversational_response": A friendly, polite explanation of what you are doing (e.g., "I found the fastest route from Main Gate to Vedhanayagam Auditorium. It's approximately 380 meters.")

IMPORTANT: Return ONLY a valid JSON object without markdown fences.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `User Query: "${query}"` }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');

  const parsed = JSON.parse(text);
  parsed.engine = 'Google Gemini 2.5 Flash';
  return parsed;
}

// Local Semantic NLP Parser
export function localSemanticParse(query, landmarks) {
  const q = query.toLowerCase();

  // 1. Detect Intent
  let intent = 'find_place';
  let preference = 'standard';
  let facilityType = null;
  let sourcePlace = null;
  let destPlace = null;

  if (/nearest|closest|nearby|closest to|nearest to/i.test(q)) {
    intent = 'nearest_facility';
    preference = 'nearest';
  } else if (/from\s+(.+)\s+to\s+(.+)/i.test(q) || /between\s+(.+)\s+and\s+(.+)/i.test(q) || /how do i get|how to reach|take me|route to|directions to/i.test(q)) {
    intent = 'navigate';
  } else if (/where are|list all|show all|what are the/i.test(q)) {
    intent = 'list_facilities';
  } else if (/where is|where's|find|locate|how to find/i.test(q)) {
    intent = 'find_place';
  }

  // 2. Identify Facility Types for "nearest" or "list"
  const typeKeywords = [
    { type: 'computer_lab', regex: /computer\s*lab|comp\s*lab|cs\s*lab|coding\s*lab|software\s*lab|programming\s*lab|ai\s*lab|data\s*science\s*lab/i },
    { type: 'canteen', regex: /canteen|cafeteria|food\s*court|eatery|snacks|juice|coffee|tea|lunch|breakfast|dinner|meat\s*and\s*eat/i },
    { type: 'atm', regex: /atm|cash|bank|money|withdrawal|canara\s*bank/i },
    { type: 'medical', regex: /medical|hospital|clinic|doctor|first\s*aid|dispensary|health\s*centre|ambulance/i },
    { type: 'hostel', regex: /hostel|dorm|dormitory|residence|mess/i },
    { type: 'library', regex: /library|knowledge\s*centre|books|reading\s*room/i },
    { type: 'auditorium', regex: /auditorium|audi|convention\s*hall|seminar\s*hall/i },
    { type: 'sports', regex: /sports|ground|cricket|football|gym|gymnasium|badminton|court|tennis|track/i },
    { type: 'parking', regex: /parking|bus\s*bay|bike\s*parking|car\s*parking/i }
  ];

  for (const tk of typeKeywords) {
    if (tk.regex.test(q)) {
      facilityType = tk.type;
      break;
    }
  }

  // 3. Extract Source and Destination Entities
  // Pattern A: "from X to Y"
  const fromToMatch = q.match(/from\s+([a-z0-9\s&'-]+?)\s+(?:to|towards)\s+([a-z0-9\s&'-]+)/i);
  if (fromToMatch) {
    sourcePlace = matchPlace(fromToMatch[1].trim(), landmarks);
    destPlace = matchPlace(fromToMatch[2].trim(), landmarks);
    intent = 'navigate';
  }

  // Pattern B: "near/at/in X ... nearest Y"
  const nearPattern = q.match(/(?:i'm\s+at|i\s+am\s+at|near|from|starting\s+at)\s+([a-z0-9\s&'-]+?)(?:\.|\?|,|\s+where|\s+find|\s+how|\s+take|$)/i);
  if (nearPattern && !sourcePlace) {
    const candidateSource = matchPlace(nearPattern[1].trim(), landmarks);
    if (candidateSource) {
      sourcePlace = candidateSource;
    }
  }

  // Pattern C: Destination only ("take me to X", "where is X", "how to get to X")
  if (!destPlace) {
    // Try matching any landmark in the query
    for (const lm of landmarks) {
      // Check full name or aliases
      const terms = [lm.name.toLowerCase(), lm.shortName.toLowerCase(), ...lm.aliases];
      for (const t of terms) {
        if (t.length > 2 && q.includes(t)) {
          if (!sourcePlace || sourcePlace.id !== lm.id) {
            destPlace = lm;
            break;
          }
        }
      }
      if (destPlace) break;
    }
  }

  // Default source if navigating and no source specified
  if (intent === 'navigate' && destPlace && !sourcePlace) {
    sourcePlace = landmarks.find(l => l.id === 'as-main-left') || landmarks[0];
  }

  // Default source if nearest requested and no source specified
  if (intent === 'nearest_facility' && !sourcePlace) {
    sourcePlace = landmarks.find(l => l.id === 'as-main-left') || landmarks[0];
  }

  // 4. Generate Human Conversational Response
  let responseText = '';
  if (intent === 'nearest_facility' && facilityType) {
    const formattedType = facilityType.replace('_', ' ');
    responseText = `Finding the nearest ${formattedType} from ${sourcePlace ? sourcePlace.name : 'the Central Library'}.`;
  } else if (intent === 'navigate' && sourcePlace && destPlace) {
    responseText = `Calculating the optimal walking route from ${sourcePlace.name} to ${destPlace.name}.`;
  } else if (destPlace) {
    responseText = `${destPlace.name} is located at ${destPlace.building}, ${destPlace.floor}. Here is how to get there.`;
  } else if (intent === 'list_facilities' && facilityType) {
    responseText = `Here are the campus ${facilityType.replace('_', ' ')} facilities available at Bannari Amman Institute of Technology.`;
  } else {
    responseText = `I'm your AI Campus Navigation Assistant for BIT Sathyamangalam. You can ask me how to get to any block, find the nearest lab or canteen, or locate any campus facility.`;
  }

  return {
    engine: 'Built-in Campus Semantic NLP',
    intent,
    preference,
    source: sourcePlace ? sourcePlace.id : null,
    sourcePlace,
    destination: destPlace ? destPlace.id : null,
    destPlace,
    facility_type: facilityType,
    conversational_response: responseText
  };
}

// Semantic Place Matcher
export function matchPlace(str, landmarks) {
  if (!str) return null;
  const clean = str.toLowerCase().replace(/the|to|a|an|at|near|block|hall/g, '').trim();

  // 1. Exact alias match
  for (const lm of landmarks) {
    if (lm.name.toLowerCase() === str || lm.shortName.toLowerCase() === str) return lm;
    if (lm.aliases.includes(str)) return lm;
  }

  // 2. Contains match
  for (const lm of landmarks) {
    for (const a of lm.aliases) {
      if (str.includes(a) || a.includes(str)) return lm;
    }
  }

  // 3. Normalized keyword match
  for (const lm of landmarks) {
    const target = (lm.name + ' ' + lm.shortName + ' ' + lm.aliases.join(' ')).toLowerCase();
    if (target.includes(clean)) return lm;
  }

  return null;
}
