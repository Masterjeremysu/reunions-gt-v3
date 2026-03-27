import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { systemPrompt, userPrompt } = req.body;

  // Vérifie que la clé est bien chargée
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY manquante' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
        }),
      }
    );

    const data = await response.json();

    // Log complet pour debug
    console.log('Gemini status:', response.status);
    console.log('Gemini response:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({ error: 'Gemini API error', detail: data });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Proxy Gemini error', detail: String(err) });
  }
}
