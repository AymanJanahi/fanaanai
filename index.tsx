// FIX: Import Modality enum for better type safety and adherence to guidelines.
import { GoogleGenAI, Modality } from "@google/genai";
import homeHtml from './pages/home.html?raw';
import veoHtml from './pages/veo.html?raw';
import geminiImagesHtml from './pages/gemini-images.html?raw';
import groqTextHtml from './pages/groq-text.html?raw';
import groqTtsHtml from './pages/groq-tts.html?raw';
import huggingfaceImagesHtml from './pages/huggingface-images.html?raw';
import huggingfaceVideoHtml from './pages/huggingface-video.html?raw';
import claudeTextHtml from './pages/claude-text.html?raw';
import chatgptTextHtml from './pages/chatgpt-text.html?raw';
import deepseekTextHtml from './pages/deepseek-text.html?raw';
import openrouterHtml from './pages/openrouter.html?raw';
import apiKeysHtml from './pages/api-keys.html?raw';
import notFoundHtml from './pages/not-found.html?raw';

// --- TYPE DEFINITIONS ---
// FIX: Moved the AIStudio interface into the `declare global` block to make it a global type.
// This ensures that all declarations of 'aistudio' on the Window object are consistent
// and use the same type, resolving a TypeScript declaration conflict.
declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }

    interface Window {
        aistudio: AIStudio;
    }
}

interface ApiKeys {
    n8nWebhookUrl?: string;
    googleGenAIKey?: string;
    groqKey?: string;
    openAIKey?: string;
    anthropicKey?: string;
    openRouterKey?: string;
    deepSeekKey?: string;
    huggingFaceKey?: string;
}

// --- CONSTANTS & STATE ---
const API_KEYS_STORAGE_KEY = 'fanaan-ai-keys';
let hasAttemptedVeoKeySelection = false;

// --- UTILITY FUNCTIONS ---
const getApiKeys = (): ApiKeys => {
    try {
        const keys = localStorage.getItem(API_KEYS_STORAGE_KEY);
        return keys ? JSON.parse(keys) : {};
    } catch (error) {
        console.error("Failed to parse API keys from localStorage", error);
        return {};
    }
};

const mainContent = document.getElementById('main-content') as HTMLElement;
const navLinks = document.querySelectorAll('.nav-link');

// --- PAGE INITIALIZERS ---

const initApiKeysPage = () => {
    const form = document.getElementById('api-keys-form') as HTMLFormElement;
    if (!form) return;

    const keyInputs = {
        n8nWebhookUrl: form.querySelector('#n8nWebhookUrl') as HTMLInputElement,
        googleGenAIKey: form.querySelector('#googleGenAIKey') as HTMLInputElement,
        groqKey: form.querySelector('#groqKey') as HTMLInputElement,
        openAIKey: form.querySelector('#openAIKey') as HTMLInputElement,
        anthropicKey: form.querySelector('#anthropicKey') as HTMLInputElement,
        openRouterKey: form.querySelector('#openRouterKey') as HTMLInputElement,
        deepSeekKey: form.querySelector('#deepSeekKey') as HTMLInputElement,
        huggingFaceKey: form.querySelector('#huggingFaceKey') as HTMLInputElement,
    };

    const saveButton = document.getElementById('save-keys-button');
    const clearButton = document.getElementById('clear-keys-button');
    const toggleAllButton = document.getElementById('toggle-all-keys-visibility');
    const statusEl = document.getElementById('api-keys-status');
    const passwordToggles = form.querySelectorAll<HTMLButtonElement>('.password-toggle');

    // Load existing keys
    const currentKeys = getApiKeys();
    Object.entries(keyInputs).forEach(([key, input]) => {
        if (input && currentKeys[key as keyof ApiKeys]) {
            input.value = currentKeys[key as keyof ApiKeys]!;
        }
    });

    const showStatus = (message: string, isSuccess = true) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = isSuccess ? 'text-sm text-green-400' : 'text-sm text-red-400';
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
    };

    saveButton?.addEventListener('click', () => {
        const newKeys: ApiKeys = {};
        Object.entries(keyInputs).forEach(([key, input]) => {
            if (input.value) {
                newKeys[key as keyof ApiKeys] = input.value;
            }
        });
        localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(newKeys));
        showStatus('API keys saved successfully!');
    });

    clearButton?.addEventListener('click', () => {
        localStorage.removeItem(API_KEYS_STORAGE_KEY);
        Object.values(keyInputs).forEach(input => {
            if (input) input.value = '';
        });
        showStatus('All API keys cleared.');
    });

    const toggleVisibility = (input: HTMLInputElement, btn: HTMLButtonElement) => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;
    };
    
    passwordToggles.forEach(btn => {
        const input = btn.previousElementSibling as HTMLInputElement;
        if (input) {
            btn.addEventListener('click', () => toggleVisibility(input, btn));
        }
    });

    toggleAllButton?.addEventListener('click', () => {
        const isShowing = toggleAllButton.textContent?.includes('Show');
        passwordToggles.forEach(btn => {
            const input = btn.previousElementSibling as HTMLInputElement;
            if (input && (input.type === 'password') === isShowing) {
                toggleVisibility(input, btn);
            }
        });
        toggleAllButton.textContent = isShowing ? 'Hide All' : 'Show All';
    });
};

const initVeoPage = async () => {
    const keyInfo = document.getElementById('veo-key-info') as HTMLElement;
    const pageContent = document.getElementById('veo-page-content') as HTMLElement;
    const selectKeyButton = document.getElementById('veo-select-key-button') as HTMLButtonElement;
    const form = document.getElementById('veo-form') as HTMLFormElement;
    const generateButton = document.getElementById('veo-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('veo-status') as HTMLElement;
    const videoContainer = document.getElementById('veo-video-container') as HTMLElement;
    const videoPreview = document.getElementById('veo-video-preview') as HTMLVideoElement;
    const downloadLink = document.getElementById('veo-download-link') as HTMLAnchorElement;

    const setDownloadLinkState = (enabled: boolean, url: string | null = null) => {
        if (!downloadLink) return;
        if (enabled && url) {
            downloadLink.classList.remove('opacity-50', 'pointer-events-none');
            downloadLink.setAttribute('aria-disabled', 'false');
            downloadLink.href = url;
        } else {
            downloadLink.classList.add('opacity-50', 'pointer-events-none');
            downloadLink.setAttribute('aria-disabled', 'true');
            downloadLink.removeAttribute('href');
        }
    };

    const checkApiKey = async () => {
        // If the user has already gone through the selection process, optimistically show the content.
        // This avoids re-prompting on every navigation. The API call will fail if the key is bad.
        if (hasAttemptedVeoKeySelection) {
            keyInfo.classList.add('hidden');
            pageContent.classList.remove('hidden');
            return;
        }

        try {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (hasKey) {
                hasAttemptedVeoKeySelection = true; // Persist the state for the session
                keyInfo.classList.add('hidden');
                pageContent.classList.remove('hidden');
            } else {
                keyInfo.classList.remove('hidden');
                pageContent.classList.add('hidden');
            }
        } catch (e) {
            console.error("Error checking for AI Studio API key:", e);
            keyInfo.classList.remove('hidden');
            pageContent.classList.add('hidden');
        }
    };

    selectKeyButton.addEventListener('click', async () => {
        await window.aistudio.openSelectKey();
        // Mark that the user has attempted to select a key and show the main content.
        hasAttemptedVeoKeySelection = true;
        keyInfo.classList.add('hidden');
        pageContent.classList.remove('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;
        const resolution = formData.get('resolution') as '720p' | '1080p';
        const aspectRatio = formData.get('aspectRatio') as '16:9' | '9:16';

        if (!prompt.trim()) {
            alert('Please enter a prompt.');
            return;
        }

        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        videoContainer.classList.add('hidden');
        setDownloadLinkState(false);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt,
                config: { numberOfVideos: 1, resolution, aspectRatio },
            });

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation });
            }

            const downloadUri = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadUri) {
                const videoUrl = `${downloadUri}&key=${process.env.API_KEY}`;
                const response = await fetch(videoUrl);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                videoPreview.src = blobUrl;
                videoContainer.classList.remove('hidden');
                setDownloadLinkState(true, blobUrl);
            } else {
                throw new Error("Video generation completed but no URI was found.");
            }
        } catch (error) {
            console.error('Video generation failed:', error);
            // If the key is invalid, reset the selection state and re-run the check.
            if (error instanceof Error && error.message.includes("Requested entity was not found")) {
                 hasAttemptedVeoKeySelection = false;
                 await checkApiKey();
                 alert("API Key is invalid. Please select a valid key.");
            } else {
                alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            generateButton.disabled = false;
            statusEl.classList.add('hidden');
        }
    });

    setDownloadLinkState(false);
    await checkApiKey();
};

const initGeminiImagesPage = () => {
    const form = document.getElementById('gemini-image-form') as HTMLFormElement;
    if (!form) return;
    
    const generateButton = document.getElementById('gemini-image-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('gemini-image-status') as HTMLElement;
    const imageContainer = document.getElementById('gemini-image-container') as HTMLElement;
    const imagePreview = document.getElementById('gemini-image-preview') as HTMLImageElement;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;

        if (!prompt.trim()) {
            alert('Please enter a prompt.');
            return;
        }
        
        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        imageContainer.classList.add('hidden');
        
        try {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt,
                config: { numberOfImages: 1 },
             });
             const base64ImageBytes = response.generatedImages[0].image.imageBytes;
             imagePreview.src = `data:image/png;base64,${base64ImageBytes}`;
             imageContainer.classList.remove('hidden');
        } catch (error) {
            console.error('Image generation failed:', error);
            alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
             generateButton.disabled = false;
             statusEl.classList.add('hidden');
        }
    });
};

const initHuggingFaceImagesPage = () => {
    const form = document.getElementById('hf-image-form') as HTMLFormElement;
    if (!form) return;
    
    const generateButton = document.getElementById('hf-image-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('hf-image-status') as HTMLElement;
    const imageContainer = document.getElementById('hf-image-container') as HTMLElement;
    const imagePreview = document.getElementById('hf-image-preview') as HTMLImageElement;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKeys = getApiKeys();
        if (!apiKeys.huggingFaceKey) {
            alert('Please set your Hugging Face API key in the API Keys page.');
            return;
        }

        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;
        const model = formData.get('model') as string;

        if (!prompt.trim()) {
            alert('Please enter a prompt.');
            return;
        }
        
        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        imageContainer.classList.add('hidden');
        
        try {
            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKeys.huggingFaceKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ inputs: prompt }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const imageBlob = await response.blob();
            const imageUrl = URL.createObjectURL(imageBlob);
            imagePreview.src = imageUrl;
            imageContainer.classList.remove('hidden');

        } catch (error) {
            console.error('Image generation failed:', error);
            alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
             generateButton.disabled = false;
             statusEl.classList.add('hidden');
        }
    });
};

const initHuggingFaceVideoPage = () => {
    const form = document.getElementById('hf-video-form') as HTMLFormElement;
    if (!form) return;

    const modeToggle = form.querySelector('#hf-video-mode') as HTMLDivElement;
    const textModeButton = form.querySelector('#hf-video-mode-text') as HTMLButtonElement;
    const imageModeButton = form.querySelector('#hf-video-mode-image') as HTMLButtonElement;
    const promptInputContainer = form.querySelector('#hf-video-prompt-container') as HTMLDivElement;
    const imageInputContainer = form.querySelector('#hf-video-image-container') as HTMLDivElement;
    const imageInput = form.querySelector('#hf-video-image') as HTMLInputElement;
    const modelSelect = form.querySelector('#hf-video-model') as HTMLSelectElement;
    const generateButton = form.querySelector('#hf-video-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('hf-video-status') as HTMLElement;
    const videoContainer = document.getElementById('hf-video-container') as HTMLElement;
    const videoPreview = document.getElementById('hf-video-preview') as HTMLVideoElement;
    const downloadLink = document.getElementById('hf-video-download-link') as HTMLAnchorElement;

    const models = {
        text: { 'Zeroscope v2': 'cerspense/zeroscope_v2_576w' },
        image: { 'Stable Video Diffusion': 'stabilityai/stable-video-diffusion-img2vid-xt' }
    };
    let currentMode: 'text' | 'image' = 'text';

    const updateFormForMode = () => {
        modelSelect.innerHTML = '';
        const modelSet = models[currentMode];
        Object.entries(modelSet).forEach(([name, id]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            modelSelect.appendChild(option);
        });

        if (currentMode === 'text') {
            textModeButton.classList.add('bg-indigo-600');
            textModeButton.classList.remove('bg-gray-700');
            imageModeButton.classList.remove('bg-indigo-600');
            imageModeButton.classList.add('bg-gray-700');
            promptInputContainer.classList.remove('hidden');
            imageInputContainer.classList.add('hidden');
        } else {
            imageModeButton.classList.add('bg-indigo-600');
            imageModeButton.classList.remove('bg-gray-700');
            textModeButton.classList.remove('bg-indigo-600');
            textModeButton.classList.add('bg-gray-700');
            promptInputContainer.classList.add('hidden');
            imageInputContainer.classList.remove('hidden');
        }
    };

    textModeButton.addEventListener('click', () => {
        currentMode = 'text';
        updateFormForMode();
    });

    imageModeButton.addEventListener('click', () => {
        currentMode = 'image';
        updateFormForMode();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKeys = getApiKeys();
        if (!apiKeys.huggingFaceKey) {
            alert('Please set your Hugging Face API key in the API Keys page.');
            return;
        }

        const formData = new FormData(form);
        const model = formData.get('model') as string;
        let body: BodyInit;
        let headers: HeadersInit = { 'Authorization': `Bearer ${apiKeys.huggingFaceKey}` };

        if (currentMode === 'text') {
            const prompt = formData.get('prompt') as string;
            if (!prompt.trim()) {
                alert('Please enter a prompt.');
                return;
            }
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify({ inputs: prompt });
        } else { // image mode
            const imageFile = imageInput.files?.[0];
            if (!imageFile) {
                alert('Please select an image file.');
                return;
            }
            body = imageFile;
        }

        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        videoContainer.classList.add('hidden');

        try {
            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers,
                body,
            });

             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const videoBlob = await response.blob();
            const videoUrl = URL.createObjectURL(videoBlob);
            videoPreview.src = videoUrl;
            downloadLink.href = videoUrl;
            videoContainer.classList.remove('hidden');

        } catch (error) {
             console.error('Video generation failed:', error);
            alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            generateButton.disabled = false;
            statusEl.classList.add('hidden');
        }
    });

    // Initial setup
    updateFormForMode();
};


const initGroqTtsPage = () => {
    const form = document.getElementById('groq-tts-form') as HTMLFormElement;
    if (!form) return;
    
    const modelSelect = document.getElementById('groq-tts-model') as HTMLSelectElement;
    const voiceSelect = document.getElementById('groq-tts-voice') as HTMLSelectElement;
    const generateButton = document.getElementById('groq-tts-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('groq-tts-status') as HTMLElement;
    const audioContainer = document.getElementById('groq-tts-audio-container') as HTMLElement;
    const audioPreview = document.getElementById('groq-tts-audio-preview') as HTMLAudioElement;
    const downloadLink = document.getElementById('groq-tts-download-link') as HTMLAnchorElement;

    let currentAudioBlob: Blob | null = null;

    const voices = {
        'playai-tts': {
            male: ['Basil-PlayAI', 'Briggs-PlayAI', 'Calum-PlayAI', 'Chip-PlayAI', 'Cillian-PlayAI', 'Fritz-PlayAI', 'Mason-PlayAI', 'Mikail-PlayAI', 'Mitch-PlayAI', 'Thunder-PlayAI'],
            female: ['Arista-PlayAI', 'Atlas-PlayAI', 'Celeste-PlayAI', 'Cheyenne-PlayAI', 'Deedee-PlayAI', 'Gail-PlayAI', 'Indigo-PlayAI', 'Mamaw-PlayAI', 'Quinn-PlayAI']
        },
        'playai-tts-arabic': {
            male: ['Ahmad-PlayAI', 'Khalid-PlayAI', 'Nasser-PlayAI'],
            female: ['Amira-PlayAI']
        }
    };

    const populateVoices = () => {
        const selectedModel = modelSelect.value as keyof typeof voices;
        const availableVoices = voices[selectedModel];
        voiceSelect.innerHTML = ''; // Clear existing options

        const createOptGroup = (label: string, voiceList: string[]) => {
            const group = document.createElement('optgroup');
            group.label = label;
            voiceList.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice.replace('-PlayAI', '');
                group.appendChild(option);
            });
            return group;
        };
        
        voiceSelect.appendChild(createOptGroup('Female Voices', availableVoices.female));
        voiceSelect.appendChild(createOptGroup('Male Voices', availableVoices.male));
    };

    modelSelect.addEventListener('change', populateVoices);
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKeys = getApiKeys();
        if (!apiKeys.groqKey) {
            alert('Please set your Groq API key in the API Keys page.');
            return;
        }

        const formData = new FormData(form);
        const model = formData.get('model') as string;
        const voice = formData.get('voice') as string;
        const text = formData.get('text') as string;

        if (!text.trim()) {
            alert('Please enter some text to generate speech.');
            return;
        }

        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        audioContainer.classList.add('hidden');
        downloadLink.classList.add('hidden');
        currentAudioBlob = null;


        try {
            const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKeys.groqKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    input: text,
                    voice: voice,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`);
            }

            currentAudioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(currentAudioBlob);
            audioPreview.src = audioUrl;
            audioPreview.play();
            audioContainer.classList.remove('hidden');
            downloadLink.href = audioUrl;
            downloadLink.classList.remove('hidden');

        } catch (error) {
            console.error('TTS generation failed:', error);
            alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            generateButton.disabled = false;
            statusEl.classList.add('hidden');
        }
    });
    
    // Initial population
    populateVoices();
};


const createTextStreamer = (
    formId: string, 
    responseElId: string, 
    apiUrl: string, 
    apiKeyName: keyof ApiKeys, 
    bodyBuilder: (formData: FormData) => Record<string, any>
) => {
    const form = document.getElementById(formId) as HTMLFormElement;
    if (!form) return;
    
    const responseEl = document.getElementById(responseElId) as HTMLElement;
    const generateButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKeys = getApiKeys();
        if (!apiKeys[apiKeyName]) {
            alert(`Please set your ${apiKeyName.replace('Key', '')} API key in the API Keys page.`);
            return;
        }
        
        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;
        if (!prompt.trim()) {
            alert('Please enter a prompt.');
            return;
        }

        generateButton.disabled = true;
        responseEl.innerHTML = '<div class="animate-pulse bg-gray-700 h-4 w-3/4 rounded"></div>'; // Skeleton loader

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKeys[apiKeyName]}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bodyBuilder(formData)),
            });

            if (!response.ok || !response.body) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`);
            }

            responseEl.textContent = '';
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
                
                for (const line of lines) {
                    const jsonStr = line.replace('data:', '').trim();
                    if (jsonStr === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const content = parsed.choices[0]?.delta?.content || '';
                        responseEl.textContent += content;
                    } catch (err) {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        } catch (error) {
            console.error('Streaming failed:', error);
            responseEl.innerHTML = `<p class="text-red-400">An error occurred: ${error instanceof Error ? error.message : String(error)}</p>`;
        } finally {
            generateButton.disabled = false;
        }
    });
};


// --- ROUTING ---
const routes: Record<string, { html: string, init?: () => void | Promise<void> }> = {
    'home': { html: homeHtml },
    'veo': { html: veoHtml, init: initVeoPage },
    'gemini-images': { html: geminiImagesHtml, init: initGeminiImagesPage },
    'huggingface-images': { html: huggingfaceImagesHtml, init: initHuggingFaceImagesPage },
    'huggingface-video': { html: huggingfaceVideoHtml, init: initHuggingFaceVideoPage },
    'groq-text': { 
        html: groqTextHtml, 
        init: () => createTextStreamer(
            'groq-text-form', 
            'groq-text-response',
            'https://api.groq.com/openai/v1/chat/completions',
            'groqKey',
            (formData) => ({
                model: formData.get('model'),
                messages: [{ role: 'user', content: formData.get('prompt') }],
                stream: true,
            })
        ) 
    },
    'groq-tts': { html: groqTtsHtml, init: initGroqTtsPage },
    'claude-text': { 
        html: claudeTextHtml,
        init: () => createTextStreamer(
            'claude-text-form',
            'claude-text-response',
            'https://api.anthropic.com/v1/messages', // Note: requires proxy for CORS
            'anthropicKey',
            (formData) => ({
                model: formData.get('model'),
                messages: [{ role: 'user', content: formData.get('prompt') }],
                max_tokens: 4096,
                stream: true,
            })
        )
    },
    'chatgpt-text': { 
        html: chatgptTextHtml,
        init: () => createTextStreamer(
            'chatgpt-text-form',
            'chatgpt-text-response',
            'https://api.openai.com/v1/chat/completions',
            'openAIKey',
            (formData) => ({
                model: formData.get('model'),
                messages: [{ role: 'user', content: formData.get('prompt') }],
                stream: true,
            })
        )
    },
    'deepseek-text': { 
        html: deepseekTextHtml,
        init: () => createTextStreamer(
            'deepseek-text-form',
            'deepseek-text-response',
            'https://api.deepseek.com/chat/completions',
            'deepSeekKey',
            (formData) => ({
                model: formData.get('model'),
                messages: [{ role: 'user', content: formData.get('prompt') }],
                stream: true,
            })
        )
    },
    'openrouter': { 
        html: openrouterHtml,
        init: () => createTextStreamer(
            'openrouter-form',
            'openrouter-response',
            'https://openrouter.ai/api/v1/chat/completions',
            'openRouterKey',
            (formData) => ({
                model: formData.get('model'),
                messages: [{ role: 'user', content: formData.get('prompt') }],
                stream: true,
            })
        )
    },
    'api-keys': { html: apiKeysHtml, init: initApiKeysPage },
};

const router = () => {
    const path = window.location.hash.substring(1) || 'home';
    const route = routes[path] || { html: notFoundHtml };

    mainContent.innerHTML = route.html;
    
    navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${path}`);
    });

    // FIX: Use 'in' operator to safely check for the 'init' property on the route object, preventing a TypeScript error on union types.
    if ('init' in route && route.init) {
        route.init();
    }
};

// --- SIDEBAR ---
const initSidebar = () => {
    const toggleButton = document.getElementById('sidebar-toggle');
    const layout = document.querySelector('.dashboard-layout');
    toggleButton?.addEventListener('click', () => {
        layout?.classList.toggle('sidebar-collapsed');
    });
};

// --- APP INITIALIZATION ---
window.addEventListener('hashchange', router);
window.addEventListener('load', () => {
    // Set initial route to #home if no hash is present
    if (!window.location.hash) {
        window.location.hash = 'home';
    }
    router();
    initSidebar();
});