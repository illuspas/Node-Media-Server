export interface IAuthenticationStratergy {
    validate(key: string): Promise<boolean>;
}