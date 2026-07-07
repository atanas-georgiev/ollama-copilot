import * as vscode from 'vscode';
import { activate, deactivate } from '../extension';

describe('Extension Test Suite', () => {
  beforeEach(() => {
    // Mock the VS Code API
    jest.clearAllMocks();
  });

  test('Extension should be able to activate', async () => {
    const mockContext: vscode.ExtensionContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/path'),
      extensionPath: '/fake/path',
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn()
      },
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn()
      },
      environmentVariableCollection: {} as any,
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn()
      }
    } as unknown as vscode.ExtensionContext;

    // Test activation
    await activate(mockContext);
    
    // Verify that the extension was activated (no errors thrown)
    expect(true).toBe(true);
  });

  test('Extension should be able to deactivate', () => {
    // Test deactivation
    deactivate();
    
    // Verify that the extension can be deactivated without errors
    expect(true).toBe(true);
  });
});