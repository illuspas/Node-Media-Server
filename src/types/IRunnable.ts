export interface IRunnable {
    run(): Promise<void>; 
    stop(): Promise<void>;
}   