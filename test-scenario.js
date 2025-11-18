#!/usr/bin/env node

/**
 * Voice Agent Scenario Tester
 *
 * Tests voice agent call flows without using Retell API minutes
 * Supports interactive mode and automated test payloads
 *
 * Usage:
 *   node test-scenario.js inbound_qualifier.json --interactive
 *   node test-scenario.js inbound_qualifier.json --payload test-payloads/qualified.json
 *   node test-scenario.js inbound_qualifier.json --validate-only
 */

const fs = require('fs');
const readline = require('readline');

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Pretty print helpers
function log(msg, color = 'reset') {
  console.log(colors[color] + msg + colors.reset);
}

function header(msg) {
  console.log('\n' + colors.bright + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + colors.cyan + msg + colors.reset);
  console.log(colors.bright + colors.cyan + '═'.repeat(80) + colors.reset + '\n');
}

function subheader(msg) {
  console.log('\n' + colors.bright + msg + colors.reset);
  console.log(colors.dim + '─'.repeat(80) + colors.reset);
}

function success(msg) {
  console.log(colors.green + '✓ ' + msg + colors.reset);
}

function error(msg) {
  console.log(colors.red + '✗ ' + msg + colors.reset);
}

function warning(msg) {
  console.log(colors.yellow + '⚠ ' + msg + colors.reset);
}

function info(msg) {
  console.log(colors.blue + 'ℹ ' + msg + colors.reset);
}

// Load and validate scenario
function loadScenario(filename) {
  try {
    const data = fs.readFileSync(filename, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    error(`Failed to load scenario: ${err.message}`);
    process.exit(1);
  }
}

// Validate scenario structure
function validateScenario(scenario) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!scenario.scenarioId) errors.push('Missing required field: scenarioId');
  if (!scenario.name) errors.push('Missing required field: name');
  if (!scenario.entryNode) errors.push('Missing required field: entryNode');
  if (!scenario.nodes || !Array.isArray(scenario.nodes)) {
    errors.push('Missing or invalid nodes array');
    return { errors, warnings, valid: false };
  }
  if (!scenario.variables || !Array.isArray(scenario.variables)) {
    errors.push('Missing or invalid variables array');
  }

  // Build node index
  const nodeIndex = {};
  const nodeIds = new Set();

  scenario.nodes.forEach((node, idx) => {
    if (!node.id) {
      errors.push(`Node at index ${idx} missing id`);
    } else {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);
      nodeIndex[node.id] = node;
    }

    if (!node.type) {
      errors.push(`Node ${node.id} missing type`);
    }

    // Validate edges
    if (node.edges && Array.isArray(node.edges)) {
      node.edges.forEach((edge, edgeIdx) => {
        if (!edge.target) {
          errors.push(`Node ${node.id}, edge ${edgeIdx}: missing target`);
        }
      });
    } else if (node.type !== 'end' && node.type !== 'transfer') {
      warnings.push(`Node ${node.id} (type: ${node.type}) has no edges - may be unreachable`);
    }
  });

  // Check entry node exists
  if (!nodeIndex[scenario.entryNode]) {
    errors.push(`Entry node '${scenario.entryNode}' not found in nodes array`);
  }

  // Check all edge targets exist
  scenario.nodes.forEach(node => {
    if (node.edges) {
      node.edges.forEach(edge => {
        if (edge.target && !nodeIndex[edge.target]) {
          errors.push(`Node ${node.id}: edge target '${edge.target}' not found`);
        }
      });
    }
  });

  // Check variables referenced in prompts are defined
  const variableNames = new Set(scenario.variables.map(v => v.name));
  scenario.nodes.forEach(node => {
    if (node.prompt) {
      const matches = node.prompt.match(/\{\{(\w+)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const varName = match.replace(/\{\{|\}\}/g, '');
          if (!variableNames.has(varName)) {
            warnings.push(`Node ${node.id}: references undefined variable '${varName}'`);
          }
        });
      }
    }
  });

  return {
    errors,
    warnings,
    valid: errors.length === 0,
    nodeIndex
  };
}

// Evaluate condition
function evaluateCondition(condition, variables) {
  const { variable, operator, value } = condition;
  const actualValue = variables[variable];

  if (actualValue === undefined) {
    return false;
  }

  switch (operator) {
    case 'eq':
      return actualValue == value;
    case 'ne':
      return actualValue != value;
    case 'gt':
      return actualValue > value;
    case 'gte':
      return actualValue >= value;
    case 'lt':
      return actualValue < value;
    case 'lte':
      return actualValue <= value;
    case 'in':
      return Array.isArray(value) && value.includes(actualValue);
    case 'contains':
      return String(actualValue).includes(String(value));
    case 'exists':
      return actualValue !== undefined && actualValue !== null && actualValue !== '';
    default:
      warning(`Unknown operator: ${operator}`);
      return false;
  }
}

// Evaluate all conditions in an edge (AND logic)
function evaluateEdge(edge, variables) {
  if (!edge.conditions || edge.conditions.length === 0) {
    return true; // No conditions = always true
  }

  return edge.conditions.every(condition => evaluateCondition(condition, variables));
}

// Find next node based on edges
function findNextNode(node, variables) {
  if (!node.edges || node.edges.length === 0) {
    return null;
  }

  // Sort edges by priority (descending)
  const sortedEdges = [...node.edges].sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    return priorityB - priorityA;
  });

  // Find first edge where all conditions are true
  for (const edge of sortedEdges) {
    if (evaluateEdge(edge, variables)) {
      return { target: edge.target, edge };
    }
  }

  return null;
}

// Substitute variables in prompt
function substitutePrompt(prompt, variables) {
  if (!prompt) return '';

  return prompt.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] !== undefined ? variables[varName] : match;
  });
}

// Format variable value for display
function formatValue(value, type) {
  if (value === undefined || value === null) return '(not set)';

  switch (type) {
    case 'currency':
      return typeof value === 'number' ? `$${value.toLocaleString()}` : `$${value}`;
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date':
      return new Date(value).toLocaleDateString();
    default:
      return String(value);
  }
}

// Validate variable value
function validateVariable(value, variable) {
  const validation = variable.validation || {};
  const errors = [];

  if (validation.required && (value === undefined || value === null || value === '')) {
    errors.push('Required field');
  }

  if (value !== undefined && value !== null && value !== '') {
    if (validation.min !== undefined && value < validation.min) {
      errors.push(`Must be at least ${validation.min}`);
    }
    if (validation.max !== undefined && value > validation.max) {
      errors.push(`Must be at most ${validation.max}`);
    }
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(String(value))) {
        errors.push('Invalid format');
      }
    }
    if (validation.enum && !validation.enum.includes(value)) {
      errors.push(`Must be one of: ${validation.enum.join(', ')}`);
    }
  }

  return errors;
}

// Interactive mode - ask user for input
async function askQuestion(prompt, variable) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const validation = variable.validation || {};
    let attempts = 0;
    const maxAttempts = validation.retryLimit || 3;

    const ask = () => {
      const hint = validation.enum
        ? ` (${validation.enum.join(', ')})`
        : variable.type === 'currency'
          ? ' (e.g., 50000)'
          : variable.type === 'number'
            ? ' (numeric value)'
            : '';

      rl.question(colors.yellow + prompt + hint + ': ' + colors.reset, (answer) => {
        attempts++;

        // Parse value based on type
        let value = answer.trim();
        if (variable.type === 'number' || variable.type === 'currency') {
          value = parseFloat(value.replace(/[$,]/g, ''));
          if (isNaN(value)) {
            if (attempts < maxAttempts) {
              warning('Please enter a valid number');
              ask();
              return;
            } else {
              rl.close();
              resolve(undefined);
              return;
            }
          }
        } else if (variable.type === 'boolean') {
          value = ['yes', 'y', 'true', '1'].includes(value.toLowerCase());
        }

        // Validate
        const validationErrors = validateVariable(value, variable);
        if (validationErrors.length > 0) {
          if (attempts < maxAttempts) {
            error(validationErrors.join(', '));
            if (validation.retryMessage) {
              log(validation.retryMessage, 'yellow');
            }
            ask();
          } else {
            error(`Max retry attempts (${maxAttempts}) reached`);
            rl.close();
            resolve(undefined);
          }
        } else {
          rl.close();
          resolve(value);
        }
      });
    };

    ask();
  });
}

// Run scenario simulation
async function runSimulation(scenario, nodeIndex, payload = {}, interactive = false) {
  header(`🎙️  CALL SIMULATION: ${scenario.name}`);

  const variables = { ...payload };
  const callLog = [];
  let currentNodeId = scenario.entryNode;
  let nodeCount = 0;
  const maxNodes = 50; // Prevent infinite loops

  log(`Entry Node: ${currentNodeId}`, 'cyan');
  log(`Mode: ${interactive ? 'Interactive' : 'Automated'}`, 'cyan');
  console.log();

  while (currentNodeId && nodeCount < maxNodes) {
    nodeCount++;
    const node = nodeIndex[currentNodeId];

    if (!node) {
      error(`Node not found: ${currentNodeId}`);
      break;
    }

    subheader(`[${nodeCount}] Node: ${node.id} (${node.type})`);

    // Display prompt
    const prompt = substitutePrompt(node.prompt, variables);
    if (prompt) {
      log('AI: ' + prompt, 'green');
      callLog.push({ speaker: 'AI', text: prompt });
    }

    // Handle variable collection
    if (node.variable) {
      const varDef = scenario.variables.find(v => v.name === node.variable.name) || node.variable;

      if (interactive) {
        const value = await askQuestion(
          `\nCustomer (${varDef.label || node.variable.name})`,
          varDef
        );

        if (value !== undefined) {
          variables[node.variable.name] = value;
          callLog.push({
            speaker: 'Customer',
            text: formatValue(value, varDef.type),
            variable: node.variable.name
          });
          success(`Collected: ${node.variable.name} = ${formatValue(value, varDef.type)}`);
        } else {
          warning(`Failed to collect: ${node.variable.name}`);
          // Check for fallback node
          if (varDef.validation && varDef.validation.fallbackNode) {
            currentNodeId = varDef.validation.fallbackNode;
            info(`Jumping to fallback node: ${currentNodeId}`);
            continue;
          }
        }
      } else {
        // In automated mode, check if variable exists in payload
        if (variables[node.variable.name] !== undefined) {
          const value = variables[node.variable.name];
          log(`Customer: ${formatValue(value, varDef.type)}`, 'magenta');
          callLog.push({
            speaker: 'Customer',
            text: formatValue(value, varDef.type),
            variable: node.variable.name
          });
          success(`Collected: ${node.variable.name} = ${formatValue(value, varDef.type)}`);
        } else {
          warning(`Variable not in payload: ${node.variable.name}`);
        }
      }
    }

    // Handle branching
    if (node.type === 'branch') {
      console.log();
      log('Evaluating conditions...', 'cyan');

      if (node.edges) {
        const sortedEdges = [...node.edges].sort((a, b) => {
          const priorityA = a.priority || 0;
          const priorityB = b.priority || 0;
          return priorityB - priorityA;
        });

        for (const edge of sortedEdges) {
          const edgeLabel = edge.id || edge.target;
          const priority = edge.priority || 0;

          if (edge.conditions && edge.conditions.length > 0) {
            log(`  [Priority ${priority}] ${edgeLabel}:`, 'dim');
            const results = edge.conditions.map(cond => {
              const result = evaluateCondition(cond, variables);
              const symbol = result ? '✓' : '✗';
              const color = result ? 'green' : 'red';
              const actualValue = variables[cond.variable];
              log(`    ${symbol} ${cond.variable} ${cond.operator} ${JSON.stringify(cond.value)} (actual: ${actualValue})`, color);
              return result;
            });
            const allTrue = results.every(r => r);
            if (allTrue) {
              success(`  → Taking edge: ${edgeLabel}`);
              currentNodeId = edge.target;
              break;
            }
          } else {
            log(`  [Priority ${priority}] ${edgeLabel}: (fallback, no conditions)`, 'dim');
            success(`  → Taking fallback edge: ${edgeLabel}`);
            currentNodeId = edge.target;
            break;
          }
        }
      }
    } else if (node.type === 'end' || node.type === 'transfer' || node.type === 'escalation') {
      // Terminal nodes
      console.log();
      info(`Call ending: ${node.type.toUpperCase()}`);
      if (node.metadata && node.metadata.endReason) {
        log(`Reason: ${node.metadata.endReason}`, 'cyan');
      }
      if (node.metadata && node.metadata.transferDepartment) {
        log(`Transfer to: ${node.metadata.transferDepartment}`, 'cyan');
      }
      break;
    } else {
      // Find next node
      const next = findNextNode(node, variables);
      if (next) {
        log(`Next: ${next.target}`, 'dim');
        currentNodeId = next.target;
      } else {
        warning('No valid next node found - call ending');
        break;
      }
    }

    console.log();
  }

  if (nodeCount >= maxNodes) {
    error('Maximum node limit reached - possible infinite loop!');
  }

  // Summary
  header('📊 CALL SUMMARY');

  subheader('Variables Collected');
  Object.entries(variables).forEach(([name, value]) => {
    const varDef = scenario.variables.find(v => v.name === name);
    const type = varDef ? varDef.type : 'string';
    log(`  ${name}: ${formatValue(value, type)}`, 'white');
  });

  subheader('Call Transcript');
  callLog.forEach((entry, idx) => {
    const color = entry.speaker === 'AI' ? 'green' : 'magenta';
    const prefix = entry.speaker === 'AI' ? '🤖 AI' : '👤 Customer';
    log(`  ${prefix}: ${entry.text}`, color);
  });

  subheader('Call Metrics');
  log(`  Nodes traversed: ${nodeCount}`, 'white');
  log(`  Variables collected: ${Object.keys(variables).length}`, 'white');
  log(`  Conversation turns: ${callLog.length}`, 'white');

  if (scenario.costModel) {
    const estimatedCost = scenario.costModel.estimatedCostPerCall || 0;
    log(`  Estimated cost: $${estimatedCost.toFixed(2)}`, 'white');
  }

  console.log();
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node test-scenario.js <scenario.json> [options]');
    console.log();
    console.log('Options:');
    console.log('  --interactive          Run in interactive mode (ask for user input)');
    console.log('  --payload <file>       Run with test payload from file');
    console.log('  --validate-only        Only validate schema, do not run simulation');
    console.log();
    console.log('Examples:');
    console.log('  node test-scenario.js inbound_qualifier.json --interactive');
    console.log('  node test-scenario.js inbound_qualifier.json --payload test-payloads/qualified.json');
    console.log('  node test-scenario.js inbound_qualifier.json --validate-only');
    process.exit(0);
  }

  const scenarioFile = args[0];
  const interactive = args.includes('--interactive');
  const validateOnly = args.includes('--validate-only');
  const payloadIndex = args.indexOf('--payload');
  const payloadFile = payloadIndex !== -1 ? args[payloadIndex + 1] : null;

  // Load scenario
  header('📋 LOADING SCENARIO');
  log(`File: ${scenarioFile}`, 'cyan');
  const scenario = loadScenario(scenarioFile);
  success(`Loaded: ${scenario.name} (v${scenario.version || '1.0.0'})`);

  // Validate
  header('✓ VALIDATING SCENARIO');
  const validation = validateScenario(scenario);

  if (validation.errors.length > 0) {
    subheader('Errors');
    validation.errors.forEach(err => error(err));
  }

  if (validation.warnings.length > 0) {
    subheader('Warnings');
    validation.warnings.forEach(warn => warning(warn));
  }

  if (validation.valid) {
    success('Schema validation passed!');
    log(`  Nodes: ${scenario.nodes.length}`, 'white');
    log(`  Variables: ${scenario.variables.length}`, 'white');
    log(`  Entry node: ${scenario.entryNode}`, 'white');
  } else {
    error('Schema validation failed!');
    process.exit(1);
  }

  if (validateOnly) {
    process.exit(0);
  }

  // Load payload if provided
  let payload = {};
  if (payloadFile) {
    try {
      const data = fs.readFileSync(payloadFile, 'utf8');
      payload = JSON.parse(data);
      success(`Loaded payload: ${payloadFile}`);
    } catch (err) {
      error(`Failed to load payload: ${err.message}`);
      process.exit(1);
    }
  }

  // Run simulation
  await runSimulation(scenario, validation.nodeIndex, payload, interactive);
}

main().catch(err => {
  error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
