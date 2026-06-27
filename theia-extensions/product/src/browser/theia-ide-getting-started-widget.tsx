/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';

import { Message } from '@theia/core/lib/browser';
import { PreferenceService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    renderProductName,
    renderBentoGrid, BentoCard
} from './branding-util';

import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { VSXEnvironment } from '@theia/vsx-registry/lib/common/vsx-environment';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

@injectable()
export class TheiaIDEGettingStartedWidget extends GettingStartedWidget {

    @inject(VSXEnvironment)
    protected readonly environment: VSXEnvironment;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected vscodeApiVersion: string;

    protected async doInit(): Promise<void> {
        super.doInit();
        this.vscodeApiVersion = await this.environment.getVscodeApiVersion();
        await this.preferenceService.ready;
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const htmlElement = document.getElementById('alwaysShowWelcomePage');
        if (htmlElement) {
            htmlElement.focus();
        }
    }

    protected render(): React.ReactNode {
        if (this.workspaceService.opened) {
            return this.renderWithWorkspace();
        }
        return this.renderNoWorkspace();
    }

    /* ═══════════════════════════════════════════
       NO PROJECT: Bento with create / open / docs
       ═══════════════════════════════════════════ */

    protected renderNoWorkspace(): React.ReactNode {
        const exec = (cmd: string) => this.commandRegistry.executeCommand(cmd);

        const noProjectCards: BentoCard[] = [
            {
                icon: 'codicon-star-full',
                title: 'New Zumito Project',
                description: 'Scaffold a Discord bot project with the Zumito Framework. Start building your bot in seconds.',
                command: 'zumito-cli.createProject',
                className: 'zb-hero',
                actionLabel: 'Create Project',
                secondaryLabel: 'Open Folder',
                secondaryCommand: 'workbench.action.files.openFileFolder'
            },
            {
                icon: 'codicon-folder-opened',
                title: 'Open Project',
                description: 'Open an existing Zumito project folder.',
                command: 'workbench.action.files.openFileFolder'
            },
            {
                icon: 'codicon-history',
                title: 'Recent Projects',
                description: 'Browse your recently opened projects.',
                command: 'workbench.action.openRecent'
            },
            {
                icon: 'codicon-book',
                title: 'Documentation',
                description: 'Learn the Zumito Framework — commands, events, modules, and more.',
                url: 'https://github.com/zumito-team/zumito-framework',
                className: 'zb-tall'
            },
            {
                icon: 'codicon-organization',
                title: 'Community',
                description: 'Join the Zumito Discord for help, updates, and connecting with other devs.',
                url: 'https://discord.gg/zumito'
            },
            {
                icon: 'codicon-extensions',
                title: 'Extensions',
                description: 'Browse and install VS Code extensions to enhance your workflow.',
                command: 'workbench.view.extensions'
            }
        ];

        return <div className='gs-container'>
            <div className='gs-content-container'>
                {this.renderHeader()}
                <hr className='gs-hr' />
                {renderBentoGrid(noProjectCards, exec, 'Get Started')}
                <div className='flex-grid'>
                    <div className='col'>
                        {this.renderRecentWorkspaces()}
                    </div>
                </div>
            </div>
            <div className='gs-preference-container'>
                {this.renderPreferences()}
            </div>
        </div>;
    }

    /* ═══════════════════════════════════════════
       PROJECT OPEN: Bento with dev tools
       ═══════════════════════════════════════════ */

    protected renderWithWorkspace(): React.ReactNode {
        const exec = (cmd: string) => this.commandRegistry.executeCommand(cmd);

        const projectCards: BentoCard[] = [
            {
                icon: 'codicon-symbol-method',
                title: 'Create Command',
                description: 'Generate a new bot command with auto-registered command handler.',
                command: 'zumito-cli.createCommand'
            },
            {
                icon: 'codicon-package',
                title: 'Create Module',
                description: 'Scaffold a new framework module with commands, events, and models.',
                command: 'zumito-cli.createModule',
                className: 'zb-wide'
            },
            {
                icon: 'codicon-rss',
                title: 'Create Event',
                description: 'Add a new Discord or framework event listener.',
                command: 'zumito-cli.createEvent'
            },
            {
                icon: 'codicon-database',
                title: 'Create Model',
                description: 'Define a new database model with decorators and auto-schema.',
                command: 'zumito-cli.createModel'
            },
            {
                icon: 'codicon-globe',
                title: 'Create Route',
                description: 'Add an Express route handler to your bot.',
                command: 'zumito-cli.createRoute'
            },
            {
                icon: 'codicon-file-media',
                title: 'Create Embed',
                description: 'Build a Discord embed with the visual embed editor.',
                command: 'zumito-cli.createEmbedBuilder'
            },
            {
                icon: 'codicon-list-tree',
                title: 'Action Row Builder',
                description: 'Design interactive message components (buttons, selects).',
                command: 'zumito-cli.createActionRowBuilder'
            },
            {
                icon: 'codicon-cloud-download',
                title: 'Install Module',
                description: 'Install a community module to extend your bot.',
                command: 'zumito-cli.modules.install'
            },
            {
                icon: 'codicon-wand',
                title: 'Inject Service',
                description: 'Add dependency injection for a framework service.',
                command: 'zumito-cli.injectService'
            },
            {
                icon: 'codicon-play',
                title: 'Run Dev',
                description: 'Start your bot in development mode with hot reload.',
                command: 'zumito-cli.runDev'
            },
            {
                icon: 'codicon-debug',
                title: 'Run Debug',
                description: 'Start your bot with the debugger attached.',
                command: 'zumito-cli.runDebug'
            },
            {
                icon: 'codicon-settings-gear',
                title: 'Configure Modules',
                description: 'Manage installed modules and their settings.',
                command: 'zumito-cli.modules.configure'
            },
            {
                icon: 'codicon-server',
                title: 'Discord Portal',
                description: 'Manage your bot: invite URL, permissions, developer settings.',
                command: 'zumito-cli.discordPortal'
            },
            {
                icon: 'codicon-database',
                title: 'DB Explorer',
                description: 'Explore and edit database collections visually.',
                command: 'zumito.dbExplorer.open'
            }
        ];

        return <div className='gs-container'>
            <div className='gs-content-container'>
                {this.renderHeader()}
                <hr className='gs-hr' />
                {renderBentoGrid(projectCards, exec, 'Development Tools')}
                <div className='flex-grid'>
                    <div className='col'>
                        {this.renderSettings()}
                    </div>
                </div>
            </div>
            <div className='gs-preference-container'>
                {this.renderPreferences()}
            </div>
        </div>;
    }

    /* ═══════════════════════════════════════════
       SHARED
       ═══════════════════════════════════════════ */

    protected renderHeader(): React.ReactNode {
        return <div className='gs-header'>
            {renderProductName()}
        </div>;
    }
}
