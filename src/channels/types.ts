export interface IncomingMessage {
    channelId: string;
    userId: string;
    username: string;
    content: string;
    raw?: unknown; // original platform message object
}

export interface OutgoingMessage {
    channelId: string;
    content: string;
}

export interface Channel {
    readonly name: string;
    start(): Promise<void>;
    stop(): Promise<void>;
    send(message: OutgoingMessage): Promise<void>;
}