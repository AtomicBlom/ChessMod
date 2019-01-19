declare const enum EngineEvents {
    Created = "scriptengine:created",
}

declare interface IEngine {
    on(eventName: EngineEvents.Created, parameters: (engineHandle: IEngineHandle) => void): IClearable;

    on(eventName: string, parameters: (arguments: any) => void): IClearable;
}

declare interface IEngineHandle {
    triggerEvent(eventName: string): void;
}

declare interface IClearable {
    clear(): void;
}
declare const engine: IEngine;