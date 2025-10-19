import { GoogleGenAI, Modality } from "@google/genai";

// Page content is imported as raw text at build time
import homeContent from './pages/home.html?raw';
import veoContent from './pages/veo.html?raw';
import geminiImagesContent from './pages/gemini-images.html?raw';
import hfImagesContent from './pages/huggingface-images.html?raw';
import hfVideoContent from './pages/huggingface-video.html?raw';
import groqTextContent from './pages/groq-text.html?raw';
import groqTtsContent from './pages/groq-tts.html?raw';
import claudeTextContent from './pages/claude-text.html?raw';
import chatgptTextContent from './pages/chatgpt-text.html?raw';
import deepseekTextContent from './pages/deepseek-text.html?raw';
import openrouterContent from './pages/openrouter.html?raw';
import apiKeysContent from './pages/api-keys.html?raw';
import notFoundContent from './pages/not-found.html?raw';

// Helper to get element by ID and throw if not found
function getById<T extends HTMLElement>(id: string, type: { new(): T }): T {
    const el = document.getElementById(id);
    if (!el || !(el instanceof type)) {
        throw new Error(`Element with id '${id}' not found or is not of type ${type.name}`);
    }
    return el;
}

// Global state
let veoApiKeySelected = false;

// --- API Keys Management ---
const API_KEYS = {
    n8nWebhookUrl: "",
    googleGenAIKey: "",
    groqKey: "",
    huggingFaceKey: "",
    openAIKey: "",
    anthropicKey: "",
    openRouterKey: "",
    deepSeekKey: "",
};
type ApiKey = keyof typeof API_KEYS;

function loadApiKeys() {
    Object.keys(API_KEYS).forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
            (API_KEYS as any)[key] = value;
        }
    });
}

function saveApiKeys() {
    Object.keys(API_KEYS).forEach(key => {
        const input = document.getElementById(key) as HTMLInputElement;
        if (input) {
            localStorage.setItem(key, input.value);
            (API_KEYS as any)[key] = input.value;
        }
    });
}

// --- Webhook Helper ---
async function sendWebhook(page: string, data: any) {
    const webhookUrl = API_KEYS.n8nWebhookUrl;
    if (!webhookUrl) return;

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: `FanaanAI-${page}`, ...data }),
        });
    } catch (error) {
        console.error("Webhook failed:", error);
    }
}

// --- Generic UI Helpers ---
function toggleLoading(buttonId: string, isLoading: boolean, loadingText = 'Generating...') {
    const button = getById(buttonId, HTMLButtonElement);
    button.disabled = isLoading;
    if (isLoading) {
        button.innerHTML = `<div class="spinner"></div> ${loadingText}`;
    } else {
        button.innerHTML = button.dataset.originalText || 'Generate';
    }
}

// --- Generic Text Streaming ---
async function streamTextResponse(
    url: string,
    apiKey: string,
    payload: object,
    responseElementId: string,
    buttonId: string,
    webhookToggleId: string,
    pageName: string,
    customChunkParser: (chunk: string) => string | null = (chunk) => {
        try {
            const json = JSON.parse(chunk.replace('data: ', ''));
            return json.choices?.[0]?.delta?.content || null;
        } catch {
            return null;
        }
    }
) {
    const responseEl = getById(responseElementId, HTMLDivElement);
    responseEl.textContent = '';
    toggleLoading(buttonId, true);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.statusText} - ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            chunk.split('\n\n').forEach(line => {
                if (line.startsWith('data: ')) {
                    const content = customChunkParser(line);
                    if (content) {
                        responseEl.textContent += content;
                        fullResponse += content;
                    }
                }
            });
        }
        
        const webhookToggle = getById(webhookToggleId, HTMLInputElement);
        if (webhookToggle.checked) {
            await sendWebhook(pageName, { prompt: (payload as any).messages[0].content, response: fullResponse });
        }

    } catch (error) {
        responseEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
        toggleLoading(buttonId, false);
    }
}


// --- Page Initializers ---

function initApiKeysPage() {
    loadApiKeys();
    Object.keys(API_KEYS).forEach(key => {
        const input = document.getElementById(key) as HTMLInputElement;
        if (input) input.value = (API_KEYS as any)[key];
    });

    getById('save-keys-button', HTMLButtonElement).onclick = () => {
        saveApiKeys();
        const statusEl = getById('api-keys-status', HTMLParagraphElement);
        statusEl.textContent = 'Saved successfully!';
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 2000);
    };

    getById('clear-keys-button', HTMLButtonElement).onclick = () => {
        Object.keys(API_KEYS).forEach(key => {
            localStorage.removeItem(key);
            const input = document.getElementById(key) as HTMLInputElement;
            if (input) input.value = '';
            (API_KEYS as any)[key] = '';
        });
    };

    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling as HTMLInputElement;
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    });
    
    getById('toggle-all-keys-visibility', HTMLButtonElement).onclick = (e) => {
        const button = e.currentTarget as HTMLButtonElement;
        const inputs = document.querySelectorAll<HTMLInputElement>('input[type="password"], input[type="text"]');
        const isShowing = button.textContent === 'Hide All';
        inputs.forEach(input => {
            if (input.id !== 'n8nWebhookUrl') {
                 input.type = isShowing ? 'password' : 'text';
            }
        });
        button.textContent = isShowing ? 'Show All' : 'Hide All';
    };
}

function initVeoPage() {
    const keyInfo = getById('veo-key-info', HTMLDivElement);
    const pageContent = getById('veo-page-content', HTMLDivElement);
    const selectKeyButton = getById('veo-select-key-button', HTMLButtonElement);
    const form = getById('veo-form', HTMLFormElement);
    const statusEl = getById('veo-status', HTMLDivElement);
    const videoContainer = getById('veo-video-container', HTMLDivElement);
    const videoPreview = getById('veo-video-preview', HTMLVideoElement);
    const downloadLink = getById('veo-download-link', HTMLAnchorElement);
    const generateButton = getById('veo-generate-button', HTMLButtonElement);

    generateButton.dataset.originalText = 'Generate Video';

    const checkApiKey = async () => {
        if (veoApiKeySelected || await window.aistudio.hasSelectedApiKey()) {
            keyInfo.classList.add('hidden');
            pageContent.classList.remove('hidden');
            veoApiKeySelected = true;
        } else {
            keyInfo.classList.remove('hidden');
            pageContent.classList.add('hidden');
        }
    };

    selectKeyButton.onclick = async () => {
        await window.aistudio.openSelectKey();
        veoApiKeySelected = true;
        checkApiKey();
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        statusEl.classList.remove('hidden');
        videoContainer.classList.add('hidden');
        downloadLink.classList.add('hidden');
        toggleLoading('veo-generate-button', true, 'Generating...');

        try {
            // Re-create the AI client just-in-time to ensure the latest key is used.
            if (!API_KEYS.googleGenAIKey && typeof process === 'undefined') {
                // This is a browser environment, rely on the aistudio provided key
                await checkApiKey();
                 if (!veoApiKeySelected && !await window.aistudio.hasSelectedApiKey()) {
                     throw new Error("API Key not selected. Please select a key.");
                 }
            }
            const apiKey = API_KEYS.googleGenAIKey || process.env.API_KEY!;
            if (!apiKey) throw new Error("Google GenAI API Key is missing.");

            const ai = new GoogleGenAI({ apiKey });

            const formData = new FormData(form);
            const prompt = formData.get('prompt') as string;
            
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                config: {
                    numberOfVideos: 1,
                    resolution: formData.get('resolution') as '1080p' | '720p',
                    aspectRatio: formData.get('aspectRatio') as '16:9' | '9:16',
                }
            });

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation });
            }

            const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) throw new Error("Video generation failed to produce a URI.");
            
            const videoResponse = await fetch(`${videoUri}&key=${apiKey}`);
            const videoBlob = await videoResponse.blob();
            const videoUrl = URL.createObjectURL(videoBlob);
            
            videoPreview.src = videoUrl;
            downloadLink.href = videoUrl;
            videoContainer.classList.remove('hidden');
            downloadLink.classList.remove('hidden');
            
            const webhookToggle = getById('veo-webhook-toggle', HTMLInputElement);
            if (webhookToggle.checked) {
                await sendWebhook('Veo', { prompt, videoUrl });
            }

        } catch (error) {
            statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
             if (error instanceof Error && error.message.includes("Requested entity was not found")) {
                veoApiKeySelected = false; // Reset state to re-prompt for key
                checkApiKey();
            }
        } finally {
            statusEl.classList.add('hidden');
            toggleLoading('veo-generate-button', false);
        }
    };
    
    checkApiKey();
}

function initGeminiImagesPage() {
    const form = getById('gemini-image-form', HTMLFormElement);
    const statusEl = getById('gemini-image-status', HTMLDivElement);
    const container = getById('gemini-image-container', HTMLDivElement);
    const preview = getById('gemini-image-preview', HTMLImageElement);
    const generateButton = getById('gemini-image-generate-button', HTMLButtonElement);
    generateButton.dataset.originalText = 'Generate Image';
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        statusEl.classList.remove('hidden');
        container.classList.add('hidden');
        toggleLoading('gemini-image-generate-button', true);

        try {
            const apiKey = API_KEYS.googleGenAIKey || process.env.API_KEY;
            if (!apiKey) throw new Error("Google GenAI API Key is missing.");
            const ai = new GoogleGenAI({ apiKey });
            
            const formData = new FormData(form);
            const prompt = formData.get('prompt') as string;

            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1 },
            });

            const base64Image = response.generatedImages[0].image.imageBytes;
            const imageUrl = `data:image/png;base64,${base64Image}`;
            preview.src = imageUrl;
            container.classList.remove('hidden');
            
            const webhookToggle = getById('gemini-image-webhook-toggle', HTMLInputElement);
            if (webhookToggle.checked) {
                await sendWebhook('Gemini-Images', { prompt, image: imageUrl });
            }

        } catch (error) {
            statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        } finally {
            if (container.classList.contains('hidden')) { // Only hide status if no image is shown
                 statusEl.classList.add('hidden');
            }
            toggleLoading('gemini-image-generate-button', false);
        }
    };
}


function initHfCommon(
    formId: string, 
    statusId: string, 
    containerId: string, 
    previewId: string, 
    buttonId: string,
    webhookToggleId: string, 
    pageName: string,
    resultHandler: (blob: Blob) => { url: string; data?: any }
) {
    const form = getById(formId, HTMLFormElement);
    const statusEl = getById(statusId, HTMLDivElement);
    const container = getById(containerId, HTMLDivElement);
    const preview = document.getElementById(previewId) as HTMLImageElement | HTMLVideoElement;
    const generateButton = getById(buttonId, HTMLButtonElement);
    generateButton.dataset.originalText = generateButton.textContent!;

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<div class="spinner"></div> Generating... This may take a moment.`;
        container.classList.add('hidden');
        toggleLoading(buttonId, true, 'Generating...');

        try {
            const apiKey = API_KEYS.huggingFaceKey;
            if (!apiKey) throw new Error("Hugging Face API Key is missing.");

            const formData = new FormData(form);
            const model = formData.get('model') as string;
            const prompt = formData.get('prompt') as string;
            
            const isImageToVideo = (formData.get('image') as File)?.size > 0;
            let data: any = { inputs: prompt };

            if (isImageToVideo) {
                const imageFile = formData.get('image') as File;
                const reader = new FileReader();
                const filePromise = new Promise<ArrayBuffer>((resolve, reject) => {
                    reader.onload = e => resolve(e.target?.result as ArrayBuffer);
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(imageFile);
                });
                const imageData = await filePromise;
                data = imageData;
            }

            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: isImageToVideo ? data : JSON.stringify(data),
            });

            if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const blob = await response.blob();
            const { url, data: resultData } = resultHandler(blob);
            preview.src = url;
            container.classList.remove('hidden');

            const downloadLink = container.querySelector('a');
            if(downloadLink) {
                downloadLink.href = url;
                downloadLink.classList.remove('hidden');
            }
            
            const webhookToggle = getById(webhookToggleId, HTMLInputElement);
            if (webhookToggle.checked) {
                await sendWebhook(pageName, { prompt, model, result: resultData || url });
            }

        } catch (error) {
            statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        } finally {
            if (container.classList.contains('hidden')) {
                 statusEl.classList.add('hidden');
            }
            toggleLoading(buttonId, false);
        }
    };
}


function initHfImagesPage() {
    initHfCommon(
        'hf-image-form', 
        'hf-image-status', 
        'hf-image-container', 
        'hf-image-preview', 
        'hf-image-generate-button',
        'hf-image-webhook-toggle',
        'HuggingFace-Images',
        (blob) => ({ url: URL.createObjectURL(blob) })
    );
}

function initHfVideoPage() {
    const textModeBtn = getById('hf-video-mode-text', HTMLButtonElement);
    const imageModeBtn = getById('hf-video-mode-image', HTMLButtonElement);
    const modelSelect = getById('hf-video-model', HTMLSelectElement);
    const promptContainer = getById('hf-video-prompt-container', HTMLDivElement);
    const imageContainer = getById('hf-video-image-container', HTMLDivElement);

    const models = {
        text: [{ id: 'PAIR/zeroscope_v2_576w', name: 'Zeroscope v2 576w' }, { id: 'cerspense/zeroscope_v2_576w', name: 'Zeroscope v2 576w (cerspense)' }],
        image: [{ id: 'stabilityai/stable-video-diffusion-img2vid-xt', name: 'Stable Video Diffusion' }],
    };

    const updateMode = (mode: 'text' | 'image') => {
        modelSelect.innerHTML = '';
        models[mode].forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = m.name;
            modelSelect.appendChild(option);
        });

        if (mode === 'text') {
            textModeBtn.classList.replace('bg-gray-700', 'bg-indigo-600');
            imageModeBtn.classList.replace('bg-indigo-600', 'bg-gray-700');
            promptContainer.classList.remove('hidden');
            imageContainer.classList.add('hidden');
        } else {
            imageModeBtn.classList.replace('bg-gray-700', 'bg-indigo-600');
            textModeBtn.classList.replace('bg-indigo-600', 'bg-gray-700');
            promptContainer.classList.add('hidden');
            imageContainer.classList.remove('hidden');
        }
    };

    textModeBtn.onclick = () => updateMode('text');
    imageModeBtn.onclick = () => updateMode('image');
    updateMode('text'); // Initial state

    initHfCommon(
        'hf-video-form', 
        'hf-video-status', 
        'hf-video-container', 
        'hf-video-preview', 
        'hf-video-generate-button',
        'hf-video-webhook-toggle',
        'HuggingFace-Video',
        (blob) => {
            const url = URL.createObjectURL(blob);
            const videoPreview = getById('hf-video-preview', HTMLVideoElement);
            videoPreview.onloadeddata = () => URL.revokeObjectURL(url);
            return { url };
        }
    );
}


function createTextGenerator(pageName: string, apiUrl: string, apiKeyName: ApiKey, modelElementId: string, promptElementId: string, responseElementId: string, buttonId: string, webhookToggleId: string, customChunkParser?: (chunk: string) => string | null) {
    return () => {
        const form = document.querySelector('form')!;
        getById(buttonId, HTMLButtonElement).dataset.originalText = 'Generate Text';
        
        form.onsubmit = (e) => {
            e.preventDefault();
            const model = getById(modelElementId, HTMLSelectElement).value;
            const prompt = getById(promptElementId, HTMLTextAreaElement).value;
            const apiKey = API_KEYS[apiKeyName];
            if (!apiKey) {
                getById(responseElementId, HTMLDivElement).textContent = `Error: API Key for ${pageName} is missing.`;
                return;
            }
            const payload = { model, messages: [{ role: 'user', content: prompt }], stream: true };
            streamTextResponse(apiUrl, apiKey, payload, responseElementId, buttonId, webhookToggleId, pageName, customChunkParser);
        };
    };
}

function initGroqTtsPage() {
    const form = getById('groq-tts-form', HTMLFormElement);
    const statusEl = getById('groq-tts-status', HTMLDivElement);
    const container = getById('groq-tts-audio-container', HTMLDivElement);
    const audioPreview = getById('groq-tts-audio-preview', HTMLAudioElement);
    const downloadLink = getById('groq-tts-download-link', HTMLAnchorElement);
    const generateButton = getById('groq-tts-generate-button', HTMLButtonElement);
    generateButton.dataset.originalText = 'Generate Speech';

    const modelSelect = getById('groq-tts-model', HTMLSelectElement);
    const voiceSelect = getById('groq-tts-voice', HTMLSelectElement);

    const voices = {
        'playai-tts': {
            male: ['Basil-PlayAI', 'Briggs-PlayAI', 'Calum-PlayAI', 'Chip-PlayAI', 'Cillian-PlayAI', 'Fritz-PlayAI', 'Mason-PlayAI', 'Mikail-PlayAI', 'Mitch-PlayAI', 'Thunder-PlayAI'],
            female: ['Arista-PlayAI', 'Atlas-PlayAI', 'Celeste-PlayAI', 'Cheyenne-PlayAI', 'Deedee-PlayAI', 'Gail-PlayAI', 'Indigo-PlayAI', 'Mamaw-PlayAI', 'Quinn-PlayAI'],
        },
        'playai-tts-arabic': {
            male: ['Ahmad-PlayAI', 'Khalid-PlayAI', 'Nasser-PlayAI'],
            female: ['Amira-PlayAI'],
        }
    };

    const populateVoices = () => {
        voiceSelect.innerHTML = '';
        const selectedModel = modelSelect.value as keyof typeof voices;
        const modelVoices = voices[selectedModel];
        
        Object.entries(modelVoices).forEach(([gender, voiceList]) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = gender.charAt(0).toUpperCase() + gender.slice(1);
            voiceList.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice.replace('-PlayAI', '');
                optgroup.appendChild(option);
            });
            voiceSelect.appendChild(optgroup);
        });
    };
    
    modelSelect.onchange = populateVoices;
    populateVoices();

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        statusEl.classList.remove('hidden');
        container.classList.add('hidden');
        downloadLink.classList.add('hidden');
        toggleLoading('groq-tts-generate-button', true);

        try {
            const apiKey = API_KEYS.groqKey;
            if (!apiKey) throw new Error("Groq API Key is missing.");

            const formData = new FormData(form);
            const model = formData.get('model') as string;
            const voice = formData.get('voice') as string;
            const text = formData.get('text') as string;
            
            const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model, input: text, voice }),
            });

            if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            audioPreview.src = url;
            downloadLink.href = url;
            container.classList.remove('hidden');
            downloadLink.classList.remove('hidden');
            
            const webhookToggle = getById('groq-tts-webhook-toggle', HTMLInputElement);
            if (webhookToggle.checked) {
                await sendWebhook('Groq-TTS', { text, model, voice });
            }

        } catch (error) {
            statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        } finally {
             if (container.classList.contains('hidden')) {
                 statusEl.classList.add('hidden');
            }
            toggleLoading('groq-tts-generate-button', false);
        }
    };
}


// --- Router ---
const routes: { [key: string]: { content: string; init?: () => void; title: string } } = {
    'home': { content: homeContent, title: 'Home' },
    'veo': { content: veoContent, init: initVeoPage, title: 'Generate Video (Veo)' },
    'gemini-images': { content: geminiImagesContent, init: initGeminiImagesPage, title: 'Generate Images (Gemini)' },
    'huggingface-images': { content: hfImagesContent, init: initHfImagesPage, title: 'Generate Images (Hugging Face)' },
    'huggingface-video': { content: hfVideoContent, init: initHfVideoPage, title: 'Generate Video (Hugging Face)' },
    'groq-text': {
        content: groqTextContent,
        init: createTextGenerator('Groq', 'https://api.groq.com/openai/v1/chat/completions', 'groqKey', 'groq-text-model', 'groq-text-prompt', 'groq-text-response', 'groq-text-generate-button', 'groq-text-webhook-toggle'),
        title: 'Generate Text (Groq)',
    },
    'groq-tts': { content: groqTtsContent, init: initGroqTtsPage, title: 'Generate Speech (Groq)' },
    'claude-text': {
        content: claudeTextContent,
        init: createTextGenerator(
            'Claude', 
            'https://api.anthropic.com/v1/messages', 
            'anthropicKey', 
            'claude-text-model', 
            'claude-text-prompt', 
            'claude-text-response', 
            'claude-text-generate-button',
            'claude-text-webhook-toggle',
            (chunk) => { // Custom parser for Claude
                try {
                    const json = JSON.parse(chunk.replace('data: ', ''));
                    if (json.type === 'content_block_delta') {
                        return json.delta?.text || null;
                    }
                    return null;
                } catch { return null; }
            }
        ),
        title: 'Generate Text (Claude)',
    },
    'chatgpt-text': {
        content: chatgptTextContent,
        init: createTextGenerator('ChatGPT', 'https://api.openai.com/v1/chat/completions', 'openAIKey', 'chatgpt-text-model', 'chatgpt-text-prompt', 'chatgpt-text-response', 'chatgpt-text-generate-button', 'chatgpt-text-webhook-toggle'),
        title: 'Generate Text (ChatGPT)',
    },
    'deepseek-text': {
        content: deepseekTextContent,
        init: createTextGenerator('DeepSeek', 'https://api.deepseek.com/chat/completions', 'deepSeekKey', 'deepseek-text-model', 'deepseek-text-prompt', 'deepseek-text-response', 'deepseek-text-generate-button', 'deepseek-text-webhook-toggle'),
        title: 'Generate Text (DeepSeek)',
    },
    'openrouter': {
        content: openrouterContent,
        init: createTextGenerator('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', 'openRouterKey', 'openrouter-model', 'openrouter-prompt', 'openrouter-response', 'openrouter-generate-button', 'openrouter-webhook-toggle'),
        title: 'Generate with OpenRouter',
    },
    'api-keys': { content: apiKeysContent, init: initApiKeysPage, title: 'API Keys' },
};

function router() {
    const contentEl = document.getElementById('content')!;
    const hash = window.location.hash.substring(1) || 'home';
    // FIX: Explicitly type `route` to prevent type inference issues where `init` property is not found on the fallback object.
    const route: { content: string; init?: () => void; title: string; } = routes[hash] || { content: notFoundContent, title: 'Not Found' };

    contentEl.innerHTML = route.content;
    document.title = `Fanaan AI - ${route.title}`;
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${hash}`);
    });

    if (route.init) {
        route.init();
    }
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Sidebar toggle functionality
    const toggleButton = getById('sidebar-toggle', HTMLButtonElement);
    toggleButton.onclick = () => {
        document.body.classList.toggle('sidebar-collapsed');
    };
    
    // Initial setup
    loadApiKeys();
    window.addEventListener('hashchange', router);
    router(); // Initial page load
});

// FIX: Define a named interface `AIStudio` and use it for `window.aistudio` to resolve conflicts with other global declarations.
declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }
    interface Window {
        aistudio: AIStudio;
    }
}
