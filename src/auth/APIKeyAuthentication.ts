import { IAuthenticationStratergy } from "../types/IAuthenticationStratergy";

export class APIKeyAuthentication implements IAuthenticationStratergy {
    constructor(
        private _keys: string[] = []
    ) 
    {
        console.log("created!");
    }


    public async validate(key: string): Promise<boolean> {
        return this._keys.includes(key);
    }
}