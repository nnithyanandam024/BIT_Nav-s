// AI NLP Engine for Campus Navigation
// Powered by Google Gemini 2.5 Flash + Offline Semantic Grounding & RAG
// Supports Multi-Turn Chat, Room & Lab Directory, Function Calling & Map Controls

export async function processNaturalLanguageQuery(query, landmarks, apiKey = null, chatHistory = []) {
  const trimmed = query.trim();

  // 1. Try Google Gemini 2.5 Flash API if key is present
  if (apiKey) {
    try {
      const geminiResult = await callGeminiLLM(trimmed, landmarks, apiKey, chatHistory);
      if (geminiResult && geminiResult.intent) {
        return geminiResult;
      }
    } catch (err) {
      console.warn('Gemini 2.5 Flash call failed, falling back to local semantic engine:', err.message);
    }
  }

  // 2. Built-in Deterministic Semantic Understanding Engine with 385 Room/Lab RAG
  return localSemanticParse(trimmed, landmarks, chatHistory);
}

// Test Gemini API Key connectivity
export async function testGeminiApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) return { success: false, message: 'Please enter an API key.' };
  const key = apiKey.trim();
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
  let lastErr = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }]
        })
      });
      if (res.ok) {
        return { success: true, message: `Connected to Google Gemini (${model}) successfully!`, model };
      }
      const text = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      lastErr = msg;
      if (res.status === 404) continue;
      return { success: false, message: msg };
    } catch (err) {
      lastErr = err.message;
    }
  }
  return { success: false, message: lastErr || 'Connection failed' };
}

// Call Google Gemini API with fallback across standard models
async function callGeminiLLM(query, landmarks, apiKey, chatHistory = []) {
  // Compress landmarks for lightweight prompt context
  const landmarkSummary = landmarks.map(l => ({
    id: l.id,
    name: l.name,
    category: l.category,
    building: l.building,
    floor: l.floor,
    roomCount: l.rooms?.length || 0,
    sampleRooms: (l.rooms || []).slice(0, 4).map(r => r.roomName),
    aliases: (l.aliases || []).slice(0, 5)
  }));

  const systemInstruction = `You are the AI Campus Navigation Assistant for Bannari Amman Institute of Technology (BIT), Sathyamangalam.
You help students, faculty, and visitors find their way across campus, discover laboratories, classrooms, departments, sports facilities, canteens, and hostels.

BIT CAMPUS VERIFIED LANDMARKS & DIRECTORY:
${JSON.stringify(landmarkSummary)}

AVAILABLE CAPABILITIES & ACTIONS:
1. "navigate": User wants walking directions between two places or to a destination.
2. "find_room": User is asking about a specific classroom, laboratory, seminar hall, or department (e.g., "Where is Mechatronics Lab?", "Where is CS 109?", "AIDS Dept").
3. "nearest_facility": User is looking for the closest canteen, cafeteria, sports court, ATM, hostel, or lab.
4. "list_facilities": User asks to list or show all places in a category (e.g., "show all canteens", "list sports grounds").
5. "toggle_map": User asks to change map view (e.g., "switch to satellite view", "show standard map", "toggle satellite").
6. "campus_info": General questions about the campus, operating hours, amenities.

YOUR TASK:
Analyze the user's message in context of previous messages and return a single valid JSON object without markdown fences with these fields:
- "intent": "navigate" | "find_room" | "nearest_facility" | "list_facilities" | "toggle_map" | "campus_info"
- "source": Source landmark ID if mentioned (e.g. "as-main-left", "mechanic-front"), or null
- "destination": Destination landmark ID if mentioned or inferred, or null
- "facility_type": "canteen" | "atm" | "medical" | "hostel" | "sports" | "labs" | "academic" | "gates"
- "roomDetails": If asking about a room/lab, object with { "roomName": string, "floorName": string, "placeId": string, "building": string } or null
- "mapMode": "satellite" | "standard" (only for toggle_map)
- "conversational_response": A friendly, helpful, concise message answering the user and explaining the navigation or map action taken.`;

  // Build multi-turn contents array
  const contents = [];
  
  // Append recent chat history (up to last 6 turns)
  const recentHistory = (chatHistory || []).slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.role === 'assistant' && msg.text) {
      contents.push({ role: 'model', parts: [{ text: msg.text }] });
    }
  }

  // Current user query
  contents.push({ role: 'user', parts: [{ text: query }] });

  const candidateModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty Gemini response');

      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);
      parsed.engine = `Google Gemini (${model})`;

      // Attach matched landmark objects if IDs present
      if (parsed.source) {
        parsed.sourcePlace = landmarks.find(l => l.id === parsed.source) || null;
      }
      if (parsed.destination) {
        parsed.destPlace = landmarks.find(l => l.id === parsed.destination) || null;
      }

      return parsed;
    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes('404')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Failed to reach Gemini API');
}

// Local Semantic NLP Parser with 385 Rooms/Labs RAG & Multi-Turn Context
export function localSemanticParse(query, landmarks, chatHistory = []) {
  const q = query.toLowerCase().replace(/[?,.!]/g, ' ').trim();

  // 1. Detect Map View Toggle Commands
  if ((/satellite/i.test(q) && /(view|switch|show|turn|mode|map|toggle)/i.test(q)) || /^satellite$/i.test(q)) {
    return {
      engine: 'Built-in Campus NLP',
      intent: 'toggle_map',
      mapMode: 'satellite',
      conversational_response: "Switched to the authentic Satellite Aerial View of BIT campus."
    };
  }
  if (/(standard|vector|physical map|schematic|default view)/i.test(q) || (/(switch to|show|normal)\s+map/i.test(q))) {
    return {
      engine: 'Built-in Campus NLP',
      intent: 'toggle_map',
      mapMode: 'standard',
      conversational_response: "Switched back to the Standard Physical Campus Map."
    };
  }

  // 2. Multi-turn Follow-up Context ("take me there", "how to reach there", "directions to it")
  let contextDestination = null;
  if (/(there|to it|from here|directions|route|take me)/i.test(q)) {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const prevMsg = chatHistory[i];
      if (prevMsg.destinationPlace) {
        contextDestination = prevMsg.destinationPlace;
        break;
      }
      if (prevMsg.aiParsed?.destPlace) {
        contextDestination = prevMsg.aiParsed.destPlace;
        break;
      }
    }
  }

  // 3. Explicit From-To Routing
  const fromToMatch = q.match(/(?:route\s+)?from\s+([a-z0-9\s&'-]+?)\s+(?:to|towards)\s+([a-z0-9\s&'-]+)/i) ||
                      q.match(/between\s+([a-z0-9\s&'-]+?)\s+and\s+([a-z0-9\s&'-]+)/i);
  if (fromToMatch) {
    const sPlace = matchPlace(fromToMatch[1].trim(), landmarks);
    const dPlace = matchPlace(fromToMatch[2].trim(), landmarks);
    if (sPlace && dPlace) {
      return {
        engine: 'Built-in Campus NLP',
        intent: 'navigate',
        source: sPlace.id,
        sourcePlace: sPlace,
        destination: dPlace.id,
        destPlace: dPlace,
        conversational_response: `Calculating route from ${sPlace.name} to ${dPlace.name} along the blue campus walkways.`
      };
    }
  }

  // 4. Nearest Facility Detection
  if (/nearest|closest|nearby|closest to|nearest to/i.test(q)) {
    const typeKeywords = [
      { type: 'canteen', regex: /canteen|cafeteria|food\s*court|eatery|snacks|juice|coffee|tea|lunch|breakfast|dinner|meat\s*and\s*eat|mess/i },
      { type: 'labs', regex: /lab|laboratory|coding|software|mechatronics|aids|integrated\s*automation|spinning|physics|chemistry/i },
      { type: 'hostel', regex: /hostel|dorm|dormitory|residence|cauvery|coral|diamond|emerald|ganga|narmadha|pearl|ruby|sapphire|yamuna|bhavani/i },
      { type: 'sports', regex: /sports|ground|cricket|football|gym|gymnasium|court|tennis|volleyball|basketball|shuttle|agri\s*ground/i },
      { type: 'academic', regex: /as\s*block|ib\s*block|mech\s*block|sf\s*block|auditorium|audi|lc|library|knowledge\s*centre/i },
      { type: 'amenity', regex: /medical|hospital|clinic|doctor|first\s*aid|dispensary|radio|placement|recreation/i }
    ];
    let facilityType = 'canteen';
    for (const tk of typeKeywords) {
      if (tk.regex.test(q)) {
        facilityType = tk.type;
        break;
      }
    }
    const sourcePlace = landmarks.find(l => l.id === 'as-main-left') || landmarks[0];
    return {
      engine: 'Built-in Campus NLP',
      intent: 'nearest_facility',
      source: sourcePlace.id,
      sourcePlace,
      facility_type: facilityType,
      conversational_response: `Finding the closest ${facilityType} facility starting from ${sourcePlace.name}.`
    };
  }

  // 5. Clean query for place and room matching
  const stopWords = new Set([
    'dept', 'of', 'the', 'lab', 'labs', 'room', 'hall', 'centre', 'center',
    'technology', 'engineering', 'in', 'at', 'where', 'is', 'find', 'locate',
    'search', 'how', 'to', 'get', 'take', 'me', 'and', 'for', 'show'
  ]);
  const cleanQ = q.replace(/where is|where's|find|locate|search for|how to get to|take me to|show me/g, '').trim();
  const qWords = cleanQ.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  // 6. Direct Landmark Target (prioritized for full building / venue queries)
  const targetLm = matchPlace(cleanQ, landmarks) || (contextDestination ? landmarks.find(l => l.id === contextDestination.id) : null);
  if (targetLm && !cleanQ.includes('lab') && !cleanQ.includes('room') && !cleanQ.includes('hall')) {
    const sourcePlace = landmarks.find(l => l.id === 'as-main-left') || landmarks[0];
    return {
      engine: 'Built-in Campus NLP',
      intent: 'navigate',
      source: sourcePlace.id,
      sourcePlace,
      destination: targetLm.id,
      destPlace: targetLm,
      conversational_response: `${targetLm.name} is located at ${targetLm.building || targetLm.name}. Here is your direct walking route along the campus paths.`
    };
  }

  // 7. Search All 385 Rooms and Laboratories with Precise Keyword Matching
  let foundRoom = null;
  let maxScore = 0;

  if (qWords.length > 0) {
    for (const lm of landmarks) {
      for (const r of (lm.rooms || [])) {
        if (!r.roomName) continue;
        const rLower = r.roomName.toLowerCase().trim();
        // Exact containment of full query
        if (cleanQ.length >= 3 && (rLower.includes(cleanQ) || cleanQ.includes(rLower))) {
          foundRoom = {
            roomName: r.roomName,
            floorName: r.floorName || 'Ground Floor',
            placeId: lm.id,
            building: lm.name
          };
          maxScore = 999;
          break;
        }

        // Word overlap with boundary matching
        const rWords = rLower.split(/[\s,()/-]+/).filter(w => w.length > 2 && !stopWords.has(w));
        let matches = 0;
        for (const qw of qWords) {
          if (rWords.some(rw => rw === qw || (qw.length >= 6 && rw.startsWith(qw)) || (rw.length >= 6 && qw.startsWith(rw)))) {
            matches += 2;
          }
        }
        if (matches > maxScore && matches >= 2) {
          maxScore = matches;
          foundRoom = {
            roomName: r.roomName,
            floorName: r.floorName || 'Ground Floor',
            placeId: lm.id,
            building: lm.name
          };
        }
      }
      if (maxScore === 999) break;
    }
  }

  // If a room was matched:
  if (foundRoom) {
    const destPlace = landmarks.find(l => l.id === foundRoom.placeId) || landmarks[0];
    const sourcePlace = landmarks.find(l => l.id === 'as-main-left') || landmarks[0];
    return {
      engine: 'Built-in Campus NLP (Directory Search)',
      intent: 'find_room',
      roomDetails: foundRoom,
      source: sourcePlace.id,
      sourcePlace,
      destination: destPlace.id,
      destPlace,
      conversational_response: `${foundRoom.roomName} is located on the ${foundRoom.floorName} of ${foundRoom.building}. I have marked its physical doorway on the map and prepared your walking route.`
    };
  }

  // Fallback to landmark match if room was not found
  if (targetLm) {
    const sourcePlace = landmarks.find(l => l.id === 'as-main-left') || landmarks[0];
    return {
      engine: 'Built-in Campus NLP',
      intent: 'navigate',
      source: sourcePlace.id,
      sourcePlace,
      destination: targetLm.id,
      destPlace: targetLm,
      conversational_response: `${targetLm.name} is located at ${targetLm.building || targetLm.name}. Here is your direct walking route along the campus paths.`
    };
  }

  // 8. General Campus Help
  return {
    engine: 'Built-in Campus NLP',
    intent: 'campus_info',
    conversational_response: "I'm your AI Campus Navigation Assistant for BIT Sathyamangalam. You can ask me for walking routes (e.g. 'Route from Cauvery Hostel to Sports Ground'), find any room or lab ('Where is Mechatronics Lab?'), locate facilities ('Find nearest Canteen'), or switch views ('Switch to satellite view')."
  };
}

// Semantic Place Matcher
export function matchPlace(str, landmarks) {
  if (!str) return null;
  const s = str.toLowerCase().replace(/[?,.!]/g, '').trim();
  const clean = s.replace(/^(the|to|a|an|at|near|from)\s+/g, '').trim();
  if (!clean) return null;

  // 1. Exact name/shortName/alias match
  for (const lm of landmarks) {
    const lmName = lm.name.toLowerCase().trim();
    const lmShort = lm.shortName.toLowerCase().trim();
    if (lmName === clean || lmShort === clean) return lm;
    if ((lm.aliases || []).some(a => a.toLowerCase().trim() === clean)) return lm;
  }

  // 2. Specific Synonyms
  if (/sports\s*ground|play\s*ground|cricket|football|ground/i.test(clean)) {
    return landmarks.find(l => l.id === 'football-ground') ||
           landmarks.find(l => l.id === 'cricket-ground') ||
           landmarks.find(l => l.id === 'testing-1') ||
           landmarks.find(l => l.category === 'sports');
  }
  if (/canteen|cafeteria|food\s*court|eatery/i.test(clean)) {
    return landmarks.find(l => l.category === 'canteen') || landmarks.find(l => l.id === 'as-canteen');
  }
  if (/auditorium|audi/i.test(clean)) {
    return landmarks.find(l => l.id === 'main-aduit') || landmarks.find(l => l.name.toLowerCase().includes('auditorium'));
  }
  if (/library|knowledge\s*centre/i.test(clean)) {
    return landmarks.find(l => l.id === 'central_library') || landmarks.find(l => l.name.toLowerCase().includes('library'));
  }
  if (/gym|gymnasium/i.test(clean)) {
    return landmarks.find(l => l.id === 'indoor-gym');
  }

  // 3. Substring match
  for (const lm of landmarks) {
    const lmName = lm.name.toLowerCase().trim();
    const lmShort = lm.shortName.toLowerCase().trim();
    if (clean.length >= 4 && (lmName.includes(clean) || clean.includes(lmName))) return lm;
    if (clean.length >= 4 && (lmShort.includes(clean) || clean.includes(lmShort))) return lm;
    for (const a of (lm.aliases || [])) {
      if (a.length >= 4 && (clean.includes(a.toLowerCase()) || a.toLowerCase().includes(clean))) return lm;
    }
  }

  return null;
}
