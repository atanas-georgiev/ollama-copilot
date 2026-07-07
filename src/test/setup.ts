// Test setup file
import * as vscode from 'vscode';

// Mock VS Code API for testing
jest.mock('vscode', () => {
  const actualVscode = jest.requireActual('vscode');
  
  return {
    ...actualVscode,
    window: {
      ...actualVscode.window,
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      createWebviewPanel: jest.fn()
    },
    workspace: {
      ...actualVscode.workspace,
      getConfiguration: jest.fn()
    }
  };
});

// Mock the extension's main module
jest.mock('../extension', () => ({
  activate: jest.fn(),
  deactivate: jest.fn()
}));