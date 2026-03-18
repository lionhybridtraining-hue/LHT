/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_TRAININGPLAN_API_URL: string;
	readonly VITE_ROUTER_BASENAME?: string;
	readonly VITE_ASSET_BASE_PATH?: string;
	readonly VITE_PLAN_FORM_AI_ENDPOINT?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
