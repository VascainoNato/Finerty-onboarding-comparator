import type { VercelRequest, VercelResponse } from '@vercel/node';

const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'brazilsouth';
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;

const RECOGNITION_MODE = 'conversation'; // or 'dictation'
const LANGUAGE = 'en-US';

function base64ToBuffer(dataUrlOrBase64: string): Buffer | null {
  const commaIdx = dataUrlOrBase64.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrlOrBase64.slice(commaIdx + 1) : dataUrlOrBase64;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!AZURE_KEY) {
    return res.status(500).json({ error: 'AZURE_SPEECH_KEY is not configured' });
  }

  const body = req.body as { audio?: unknown } | undefined;
  const rawAudio = typeof body?.audio === 'string' ? body.audio : '';

  if (!rawAudio) {
    return res.status(400).json({ error: 'audio (base64 WAV) is required' });
  }

  const buffer = base64ToBuffer(rawAudio);
  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: 'audio could not be decoded' });
  }
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(413).json({ error: 'audio too large (max 5MB)' });
  }

  const endpoint =
    `https://${AZURE_REGION}.stt.speech.microsoft.com` +
    `/speech/recognition/${RECOGNITION_MODE}/cognitiveservices/v1` +
    `?language=${encodeURIComponent(LANGUAGE)}&format=detailed`;

  try {
    const azureRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'audio/wav',
        Accept: 'application/json',
      },
      body: buffer,
    });

    const data = (await azureRes.json().catch(() => null)) as
      | { RecognitionStatus?: string; DisplayText?: string; NBest?: Array<{ Display?: string }> }
      | null;

    if (!azureRes.ok) {
      console.error('azure transcribe non-ok', azureRes.status, data);
      return res.status(502).json({
        error: `Azure responded with ${azureRes.status}`,
      });
    }

    if (!data || data.RecognitionStatus !== 'Success') {
      console.warn('azure transcribe non-success', data?.RecognitionStatus);
      return res.status(200).json({
        text: '',
        status: data?.RecognitionStatus || 'Unknown',
      });
    }

    const text =
      data.DisplayText?.trim() || data.NBest?.[0]?.Display?.trim() || '';

    return res.status(200).json({ text, status: 'Success' });
  } catch (err) {
    console.error('transcribe handler error', err);
    return res.status(500).json({ error: 'Error transcribing audio' });
  }
}
