import { AcmConfig } from "./store/types.js";
export declare function expandTilde(filePath: string): string;
export interface LoadConfigOptions {
    path?: string;
    dbPathOverride?: string;
}
export declare function loadConfig(pathOrOptions?: string | LoadConfigOptions): AcmConfig;
//# sourceMappingURL=config.d.ts.map