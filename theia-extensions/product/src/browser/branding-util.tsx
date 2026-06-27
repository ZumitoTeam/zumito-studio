/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { WindowService } from '@theia/core/lib/browser/window/window-service';
import * as React from 'react';

export interface ExternalBrowserLinkProps {
    text: string;
    url: string;
    windowService: WindowService;
}

export function renderProductName(): React.ReactNode {
    return <h1>Zumito <span className="gs-rose-header">Studio</span></h1>;
}

function BrowserLink(props: ExternalBrowserLinkProps): JSX.Element {
    return <a
        role={'button'}
        tabIndex={0}
        onClick={() => props.windowService.openNewWindow(props.url, { external: true })}
        onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.windowService.openNewWindow(props.url, { external: true });
            }
        }}
    >
        {props.text}
    </a>;
}

export function renderWhatIs(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            What is Zumito Studio?
        </h3>
        <div>
            Zumito Studio is the development environment for creating and managing
            Discord bots with the <BrowserLink text="Zumito Framework"
                url="https://github.com/zumito-team/zumito-framework" windowService={windowService} />.
        </div>
        <div>
            Build Discord applications faster with integrated tools for commands,
            events, modules, embeds, and database models — all within a familiar IDE experience.
        </div>
    </div>;
}

export function renderQuickStart(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Quick Start
        </h3>
        <div className='gs-action-container'>
            <span className='codicon codicon-add' />
            <span style={{ marginLeft: '8px' }}>Create a new Zumito project from the Explorer sidebar</span>
        </div>
        <div className='gs-action-container'>
            <span className='codicon codicon-package' />
            <span style={{ marginLeft: '8px' }}>Install modules to extend your bot&apos;s functionality</span>
        </div>
        <div className='gs-action-container'>
            <span className='codicon codicon-terminal' />
            <span style={{ marginLeft: '8px' }}>Use the zumito CLI for scaffolding and management</span>
        </div>
    </div>;
}

export function renderExtendingCustomizing(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Extending Your Bot
        </h3>
        <div>
            Install VS Code extensions from the <BrowserLink text="OpenVSX registry" url="https://open-vsx.org/"
                windowService={windowService} /> to enhance your development experience.
            Open the extension view or browse <BrowserLink text="OpenVSX online" url="https://open-vsx.org/"
                windowService={windowService} />.
        </div>
        <div>
            The Zumito Framework is built on the <BrowserLink text="Zumito Framework documentation"
                url="https://github.com/zumito-team/zumito-framework" windowService={windowService} />.
        </div>
    </div>;
}

export function renderSupport(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Community & Support
        </h3>
        <div>
            Join the <BrowserLink text="Zumito Discord community" url="https://discord.gg/zumito"
                windowService={windowService} /> for help, updates, and connecting with other developers.
        </div>
    </div>;
}

export function renderTickets(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Reporting Issues
        </h3>
        <div>
            Found a bug or have a feature request? Open an issue on
            the <BrowserLink text="Zumito Framework GitHub"
                url="https://github.com/zumito-team/zumito-framework/issues/new/choose"
                windowService={windowService} />.
        </div>
        <div>
            For issues with Zumito Studio itself, please report them to
            the <BrowserLink text="Zumito Studio repository"
                url="https://github.com/zumito-team/zumito-studio/issues/new/choose"
                windowService={windowService} />.
        </div>
    </div>;
}

export function renderSourceCode(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Source Code
        </h3>
        <div>
            Zumito Studio and the Zumito Framework are open source and available on
            <BrowserLink text=" GitHub" url="https://github.com/zumito-team"
                windowService={windowService} />.
        </div>
    </div>;
}

export function renderDocumentation(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Documentation
        </h3>
        <div>
            Learn more about building Discord bots with the Zumito Framework in
            the <BrowserLink text="official documentation" url="https://github.com/zumito-team/zumito-framework"
                windowService={windowService} />.
        </div>
    </div>;
}

export function renderCollaboration(windowService: WindowService): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Collaboration
        </h3>
        <div>
            Share your workspace and collaborate in real-time using the built-in
            collaboration features powered by <BrowserLink text="Open Collaboration Tools"
                url="https://www.open-collab.tools/" windowService={windowService} />.
        </div>
    </div>;
}

export function renderDownloads(): React.ReactNode {
    return <div className='gs-section'>
        <h3 className='gs-section-header'>
            Updates
        </h3>
        <div className='gs-action-container'>
            Update Zumito Studio directly via File {'>'} Preferences {'>'} Check for Updates…
            The application will also check automatically after each launch.
        </div>
    </div>;
}

/* ── Bento Box Components ── */

export interface BentoCard {
    icon: string;
    title: string;
    description: string;
    command?: string;
    className?: string;
    badge?: string;
    actionLabel?: string;
    secondaryLabel?: string;
    secondaryCommand?: string;
    url?: string;
}

export function renderBentoGrid(
    cards: BentoCard[],
    executeCommand: (command: string) => void,
    showSectionLabel?: string
): React.ReactNode {
    return <div>
        {showSectionLabel && <div className='zb-section-label'>{showSectionLabel}</div>}
        <div className='zb-grid'>
            {cards.map((card, idx) => renderBentoCard(card, idx, executeCommand))}
        </div>
    </div>;
}

export function renderBentoCard(
    card: BentoCard,
    key: number,
    executeCommand: (command: string) => void
): React.ReactNode {
    const cls = `zb-card${card.className ? ' ' + card.className : ''}`;
    const handleClick = () => {
        if (card.command) {
            executeCommand(card.command);
        }
    };

    return <div key={key} className={cls} onClick={handleClick} role='button' tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && (card.command || card.url)) {
                e.preventDefault();
                if (card.command) {
                    executeCommand(card.command);
                }
            }
        }}>
        {card.url && <a href={card.url} target='_blank' rel='noreferrer' className='zb-card-link' />}
        {card.badge && <span className='zb-card-badge'>{card.badge}</span>}
        <span className={`zb-card-icon codicon ${card.icon}`} />
        <span className='zb-card-title'>{card.title}</span>
        <span className='zb-card-desc'>{card.description}</span>
        {card.actionLabel && card.command && (
            <div className='zb-hero-actions'>
                <button onClick={e => { e.stopPropagation(); executeCommand(card.command!); }}>
                    {card.actionLabel}
                </button>
                {card.secondaryLabel && card.secondaryCommand && (
                    <button className='zb-action-secondary' onClick={e => {
                        e.stopPropagation(); executeCommand(card.secondaryCommand!);
                    }}>
                        {card.secondaryLabel}
                    </button>
                )}
            </div>
        )}
    </div>;
}
