/**
 * This file is part of the vscode-deploy-reloaded distribution.
 * Copyright (c) Marcel Joachim Kloubert.
 * 
 * vscode-deploy-reloaded is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU Lesser General Public License as   
 * published by the Free Software Foundation, version 3.
 *
 * vscode-deploy-reloaded is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import * as deploy_contracts from './contracts';
import * as deploy_delete from './delete';
import * as deploy_deploy from './deploy';
import * as deploy_helpers from './helpers';
import * as deploy_i18 from './i18';
import * as deploy_list from './list';
import * as deploy_log from './log';
import * as deploy_packages from './packages';
import * as deploy_plugins from './plugins';
import * as deploy_pull from './pull';
import * as deploy_targets from './targets';
import * as Enumerable from 'node-enumerable';
import * as Events from 'events';
import * as i18next from 'i18next';
import * as Path from 'path';
import * as vscode from 'vscode';


/**
 * A workspace context.
 */
export interface WorkspaceContext {
    /**
     * The underlying extension context.
     */
    readonly extension: vscode.ExtensionContext;
    /**
     * The output channel.
     */
    readonly outputChannel: vscode.OutputChannel;
    /**
     * All plugins.
     */
    readonly plugins: deploy_plugins.Plugin[];
    /**
     * The list of other workspaces.
     */
    readonly workspaces: Workspace[];
}

/**
 * A workspace file.
 */
export interface WorkspaceFile extends deploy_contracts.WithNameAndPath, WorkspaceItem {
    /**
     * The path to the (local) file.
     */
    readonly file: string;
}

/**
 * A workspace item.
 */
export interface WorkspaceItem {
    /**
     * The underlying workspace.
     */
    readonly workspace: Workspace;
}


const FILES_CHANGES: { [path: string]: deploy_contracts.FileChangeType } = {};

/**
 * A workspace.
 */
export class Workspace extends Events.EventEmitter implements deploy_contracts.Translator, vscode.Disposable {
    /**
     * Stores the current configuration.
     */
    protected _config: deploy_contracts.Configuration;
    /**
     * Stores all disposable items.
     */
    protected readonly _DISPOSABLES: vscode.Disposable[] = [];
    /**
     * Stores if workspace has been initialized or not.
     */
    protected _isInitialized = false;
    /**
     * Stores if configuration is currently reloaded or not.
     */
    protected _isReloadingConfig = false;
    /**
     * The current translation function.
     */
    protected _translator: i18next.TranslationFunction;

    /**
     * Initializes a new instance of that class.
     * @param {vscode.WorkspaceFolder} FOLDER The underlying folder.
     * @param {WorkspaceContext} CONTEXT the current extension context.
     */
    constructor(public readonly FOLDER: vscode.WorkspaceFolder,
                public readonly CONTEXT: WorkspaceContext) {
        super();
    }

    /**
     * Gets the current configuration.
     */
    public get config(): deploy_contracts.Configuration {
        return this._config;
    }

    /**
     * Deletes a file in a target.
     * 
     * @param {string} file The file to delete.
     * @param {deploy_targets.Target} target The target to delete in.
     */
    public async deleteFileIn(file: string, target: deploy_targets.Target) {
        return await deploy_delete.deleteFileIn
                                  .apply(this, arguments);
    }

    /**
     * Deletes a package.
     * 
     * @param {deploy_packages.Package} pkg The package to delete. 
     */
    public async deletePackage(pkg: deploy_packages.Package) {
        return await deploy_delete.deletePackage
                                  .apply(this, arguments);
    }

    /**
     * Deploys a file to a target.
     * 
     * @param {string} file The file to deploy.
     * @param {deploy_targets.Target} target The target to deploy to.
     */
    public async deployFileTo(file: string, target: deploy_targets.Target) {
        return await deploy_deploy.deployFileTo
                                  .apply(this, arguments);
    }

    /**
     * Deploys a files to a target.
     * 
     * @param {string[]} files The files to deploy.
     * @param {deploy_targets.Target} target The target to deploy to.
     * @param {number} [targetNr] The number of the target.
     */
    protected async deployFilesTo(files: string[],
                                  target: deploy_targets.Target, targetNr?: number) {
        return await deploy_deploy.deployFilesTo
                                  .apply(this, arguments);
    }

    /**
     * Deploys a package.
     * 
     * @param {deploy_packages.Package} pkg The package to deploy. 
     */
    public async deployPackage(pkg: deploy_packages.Package) {
        return await deploy_deploy.deployPackage
                                  .apply(this, arguments);
    }

    /** @inheritdoc */
    public dispose() {
        const ME = this;

        ME.removeAllListeners();

        while (ME._DISPOSABLES.length > 0) {
            const DISP = ME._DISPOSABLES.pop();

            deploy_helpers.tryDispose(DISP);
        }
    }

    /**
     * Returns the list of packages as defined in the settings.
     */
    public getPackages(): deploy_packages.Package[] {
        const ME = this;

        const CFG = ME.config;
        if (!CFG) {
            return;
        }

        let index = -1;

        return Enumerable.from( deploy_helpers.asArray(CFG.packages) ).where(p => {
            return 'object' === typeof p;
        }).select(p => {
            return deploy_helpers.cloneObject(p);
        }).pipe(p => {
            ++index;

            (<any>p['__index']) = index;
            (<any>p['__workspace']) = ME;
        }).toArray();
    }

    /**
     * Returns the list of targets as defined in the settings.
     */
    public getTargets(): deploy_targets.Target[] {
        const ME = this;

        const CFG = ME.config;
        if (!CFG) {
            return;
        }

        let index = -1;

        return Enumerable.from( deploy_helpers.asArray(CFG.targets) ).where(t => {
            return 'object' === typeof t;
        }).select(t => {
            return deploy_helpers.cloneObject(t);
        }).pipe(t => {
            ++index;

            (<any>t['__index']) = index;
            (<any>t['__workspace']) = ME;
        }).toArray();
    }

    /**
     * Gets if the workspace has been initialized or not.
     */
    public get isInitialized() {
        return this._isInitialized;
    }

    /**
     * Initializes that workspace.
     * 
     * @return {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    public async initialize() {
        const ME = this;

        if (ME.isInitialized) {
            return false;
        }

        await ME.reloadConfiguration();

        ME._isInitialized = true;
        return true;
    }

    /**
     * Checks if a path is part of that workspace.
     * 
     * @param {string} path The path to check.
     * 
     * @return {boolean} Is part of that workspace or not. 
     */
    public isPathOf(path: string) {
        if (!deploy_helpers.isEmptyString(path)) {
            if (!Path.isAbsolute(path)) {
                path = Path.join(this.FOLDER.uri.fsPath, path);
            }
            path = Path.resolve(path);

            return path.startsWith(
                Path.resolve(this.FOLDER.uri.fsPath)
            );
        }

        return false;
    }

    /**
     * Is invoked when the active text editor changed.
     * 
     * @param {vscode.TextEditor} editor The new editor.
     */
    public async onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    }

    /**
     * Is invoked on a file / directory change.
     * 
     * @param {vscode.Uri} e The URI of the item.
     * @param {deploy_contracts.FileChangeType} type The type of change.
     */
    public async onDidFileChange(e: vscode.Uri, type: deploy_contracts.FileChangeType, retry = true) {
        const ME = this;

        if ('undefined' !== typeof FILES_CHANGES[e.fsPath]) {
            if (retry) {
                await deploy_helpers.invokeAfter(async () => {
                    await ME.onDidFileChange(e, type, retry);
                });
            }

            return;
        }
        FILES_CHANGES[e.fsPath] = type;

        try {
            switch (type) {
                case deploy_contracts.FileChangeType.Changed:
                    break;

                case deploy_contracts.FileChangeType.Created:
                    break;

                case deploy_contracts.FileChangeType.Deleted:
                    break;
            }
        }
        finally {
            delete FILES_CHANGES[e.fsPath];
        }
    }

    /**
     * List the root directory on a target.
     * 
     * @param {deploy_targets.Target} target The target from where to list.
     */
    public async listDirectory(target: deploy_targets.Target) {
        return await deploy_list.listDirectory
                                .apply(this, [ target ]);
    }

    /**
     * Pulls a file from a target.
     * 
     * @param {string} file The file to pull.
     * @param {deploy_targets.Target} target The target from where to pull from.
     */
    public async pullFileFrom(file: string, target: deploy_targets.Target) {
        return await deploy_pull.pullFileFrom
                                .apply(this, arguments);
    }

    /**
     * Pulls files from a target.
     * 
     * @param {string[]} files The files to pull.
     * @param {deploy_targets.Target} target The target to pull from.
     * @param {number} [targetNr] The number of the target.
     */
    protected async pullFilesFrom(files: string[],
                                  target: deploy_targets.Target, targetNr?: number) {
        return await deploy_pull.pullFilesFrom
                                .apply(this, arguments);
    }

    /**
     * Pulls a package.
     * 
     * @param {deploy_packages.Package} pkg The package to pull. 
     */
    public async pullPackage(pkg: deploy_packages.Package) {
        return await deploy_pull.pullPackage
                                .apply(this, arguments);
    }

    /**
     * Reloads the current configuration for that workspace.
     * 
     * @param {boolean} [retry] Retry when busy or not. 
     */
    public async reloadConfiguration(retry = true) {
        const ME = this;

        if (ME._isReloadingConfig) {
            if (retry) {
                await deploy_helpers.invokeAfter(async () => {
                    await ME.reloadConfiguration();
                });
            }

            return;
        }
        ME._isReloadingConfig = true;

        try {
            const SETTINGS_FILE = Path.join(
                ME.FOLDER.uri.fsPath,
                './.vscode/settings.json',
            );

            const LOADED_CFG: deploy_contracts.Configuration = vscode.workspace.getConfiguration('deploy.reloaded',
                                                                                                 vscode.Uri.file(SETTINGS_FILE)) || <any>{};

            const OLD_CFG = ME._config;
            ME._config = LOADED_CFG;
            try {
                ME.emit(deploy_contracts.EVENT_CONFIG_RELOADED,
                        ME, LOADED_CFG, OLD_CFG);
            }
            catch (e) {
                deploy_log.CONSOLE
                          .trace(e, 'workspaces.reloadConfiguration(1)');
            }

            ME._translator = null;
            try {
                ME._translator = await deploy_i18.init(ME);
            }
            catch (e) {
                deploy_log.CONSOLE
                          .trace(e, 'workspaces.reloadConfiguration(2)');
            }
        }
        finally {
            ME._isReloadingConfig = true;
        }
    }

    /** @inheritdoc */
    public t(key: string, ...args: any[]): string {
        const TRANSLATOR = this._translator;
        if (TRANSLATOR) {
            let formatStr = TRANSLATOR(deploy_helpers.toStringSafe(key));
            formatStr = deploy_helpers.toStringSafe(formatStr);
    
            return deploy_helpers.formatArray(formatStr, args);
        }

        return key;
    }

    /**
     * Extracts the name and (relative) path from a file.
     * 
     * @param {string} file The file (path).
     * 
     * @return {deploy_contracts.WithNameAndPath|false} The extracted data or (false) if file path is invalid.
     */
    public toNameAndPath(file: string): deploy_contracts.WithNameAndPath | false {
        if (deploy_helpers.isEmptyString(file)) {
            return;
        }

        let workspaceDir = Path.resolve(this.FOLDER.uri.fsPath);
        workspaceDir = deploy_helpers.replaceAllStrings(workspaceDir, Path.sep, '/');

        if (!Path.isAbsolute(file)) {
            Path.join(workspaceDir, file);
        }
        file = Path.resolve(file);
        file = deploy_helpers.replaceAllStrings(file, Path.sep, '/');

        if (!file.startsWith(workspaceDir)) {
            return false;
        }

        const NAME = Path.basename(file);

        let relativePath = Path.dirname(file).substr(workspaceDir.length);
        while (relativePath.startsWith('/')) {
            relativePath = relativePath.substr(1);
        }
        while (relativePath.endsWith('/')) {
            relativePath = relativePath.substr(0, relativePath.length - 1);
        }

        if ('' === relativePath.trim()) {
            relativePath = '';
        }

        return {
            name: NAME,
            path: relativePath,
        };
    }
}


/**
 * Returns the display name of a workspace.
 * 
 * @param {Workspace} ws The workspace.
 * 
 * @return {string} The name.
 */
export function getWorkspaceName(ws: Workspace): string {
    if (!ws) {
        return;
    }

    return Path.basename(
        ws.FOLDER.uri.fsPath
    );
}
