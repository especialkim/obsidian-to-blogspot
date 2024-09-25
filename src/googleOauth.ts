import { Vault, App, Notice } from 'obsidian';
import { MyPluginSettings } from './settings';
import * as http from 'http';
import { AddressInfo } from 'net';

export class GoogleOauth {
    private settings: MyPluginSettings;
    private vault: Vault;
    private app: App;

    constructor(settings: MyPluginSettings, vault: Vault, app: App) {
        this.settings = settings;
        this.vault = vault;
        this.app = app;
    }

    async getGoogleAuthToken(): Promise<{ access_token: string | null, refresh_token: string | null }> {
        const tokenPath = this.getTokenPath();
        try {
            const tokenContent = await this.vault.adapter.read(tokenPath);
            const token = JSON.parse(tokenContent);
            
            if (token.expiry_date && token.expiry_date > Date.now()) {
                return { 
                    access_token: token.access_token, 
                    refresh_token: token.refresh_token 
                };
            } else if (token.refresh_token) {
                const newAccessToken = await this.refreshAccessToken(token.refresh_token);
                return { 
                    access_token: newAccessToken, 
                    refresh_token: token.refresh_token 
                };
            }
        } catch (error) {
        }
        
        const newAccessToken = await this.requestAccessToken();
        const newTokenPath = this.getTokenPath();
        return {
            access_token: newAccessToken,
            refresh_token: null
        };
    }

    private async requestAccessToken(): Promise<string | null> {
        try {
            const clientSecretContent = await this.vault.adapter.read(this.settings.credentialsFilePath);
            const clientSecret = JSON.parse(clientSecretContent);
            const { client_id, client_secret } = clientSecret.installed;

            const server = await this.startLocalServer();
            const port = (server.address() as AddressInfo).port;
            const redirectUri = `http://localhost:${port}`;

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${client_id}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `response_type=code&` +
                `scope=${encodeURIComponent('https://www.googleapis.com/auth/blogger https://www.googleapis.com/auth/drive.file')}&` +
                `access_type=offline&` +
                `prompt=consent`;

            window.open(authUrl, '_blank');

            new Notice('Please complete the authentication in your browser.');

            const authCode = await this.waitForAuthCode(server);
            server.close();

            if (!authCode) return null;

            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: authCode,
                    client_id: client_id,
                    client_secret: client_secret,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code'
                })
            });

            const tokenData = await tokenResponse.json();
            if (tokenData.access_token) {
                try {
                    const tokenPath = this.getTokenPath();
                    const folderPath = tokenPath.substring(0, tokenPath.lastIndexOf('/'));
                    await this.vault.adapter.mkdir(folderPath);
                    await this.vault.adapter.write(tokenPath, JSON.stringify(tokenData));
                    await this.updatetokenStoragePath(tokenPath);
                    return tokenData.access_token;
                } catch (error) {
                    console.error('Error saving token:', error);
                }
            }
        } catch (error) {
            console.error('Error in requestAccessToken:', error);
        }

        return null;
    }

    private startLocalServer(): Promise<http.Server> {
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('Authentication successful! You can close this window now.');
            });
            server.listen(0, '127.0.0.1', () => {
                resolve(server);
            });
        });
    }

    private waitForAuthCode(server: http.Server): Promise<string | null> {
        return new Promise((resolve) => {
            server.on('request', (req, res) => {
                const url = new URL(req.url!, `http://${req.headers.host}`);
                const code = url.searchParams.get('code');
                if (code) {
                    resolve(code);
                } else {
                    resolve(null);
                }
            });
        });
    }

    private getTokenPath(): string {
        if (!this.settings.tokenStoragePath) {
            const folderPath = this.settings.credentialsFilePath.substring(0, this.settings.credentialsFilePath.lastIndexOf('/') + 1);
            const fileName = this.settings.credentialsFilePath.split('/').pop();
            this.settings.tokenStoragePath = folderPath + fileName!.replace('.json', '_token.json');
        }
        return this.settings.tokenStoragePath;
    }

    private async refreshAccessToken(refreshToken: string): Promise<string | null> {
        try {
            const clientSecretContent = await this.vault.adapter.read(this.settings.credentialsFilePath);
            const clientSecret = JSON.parse(clientSecretContent);
            const { client_id, client_secret } = clientSecret.installed;

            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: client_id,
                    client_secret: client_secret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token'
                })
            });

            const tokenData = await response.json();
            if (tokenData.access_token) {
                tokenData.expiry_date = Date.now() + (tokenData.expires_in * 1000);
                await this.vault.adapter.write(this.getTokenPath(), JSON.stringify(tokenData));
                return tokenData.access_token;
            }
        } catch (error) {
            console.error('Error refreshing access token:', error);
        }
        return null;
    }

    private async updatetokenStoragePath(tokenPath: string) {
        this.settings.tokenStoragePath = tokenPath;
        this.app.workspace.trigger('google-oauth:settings-updated');
    }
}
