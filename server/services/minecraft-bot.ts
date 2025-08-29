import { EventEmitter } from 'events';
import { Bot as MinecraftBot, createBot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { type Bot, type BotAction } from '@shared/schema';
import { storage } from '../storage';

interface BotInstance {
  bot: MinecraftBot;
  data: Bot;
  startTime: Date;
  actionIntervals: Map<string, NodeJS.Timeout>;
  continuousActions: Set<string>;
}

export class MinecraftBotService extends EventEmitter {
  private bots: Map<string, BotInstance> = new Map();
  private readonly serverHost = 'fakesalmon.aternos.me';
  private readonly serverPort = 25565;
  private readonly version = '1.21.4';

  async startBot(botData: Bot): Promise<void> {
    // If bot is already running, stop it first
    if (this.bots.has(botData.id)) {
      await this.stopBot(botData.id);
    }

    try {
      await storage.updateBot(botData.id, { status: 'connecting' });
      this.emit('statusChange', botData.id, 'connecting');

      const bot = createBot({
        host: this.serverHost,
        port: this.serverPort,
        username: botData.name,
        version: this.version,
        auth: 'offline', // For cracked servers
        hideErrors: false,
        checkTimeoutInterval: 20000, // 20 second timeout (reduced from 30)
        keepAlive: true, // Enable keepalive to prevent random disconnects
        skipValidation: true,
        fakeHost: 'localhost' // Help prevent server kicks
      });

      const botInstance: BotInstance = {
        bot,
        data: botData,
        startTime: new Date(),
        actionIntervals: new Map(),
        continuousActions: new Set(),
      };

      this.setupBotEventHandlers(botInstance);
      this.bots.set(botData.id, botInstance);

    } catch (error) {
      console.error(`Failed to start bot ${botData.name}:`, error);
      await storage.updateBot(botData.id, { status: 'error' });
      this.emit('error', botData.id, `Failed to start bot: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async stopBot(botId: string): Promise<void> {
    const botInstance = this.bots.get(botId);
    if (!botInstance) return;

    // Clear all intervals and continuous actions
    botInstance.actionIntervals.forEach(interval => clearInterval(interval));
    botInstance.actionIntervals.clear();
    botInstance.continuousActions.clear();

    botInstance.bot.quit();
    this.bots.delete(botId);
    
    await storage.updateBot(botId, { status: 'offline' });
    this.emit('statusChange', botId, 'offline');
  }

  async executeAction(botId: string, action: BotAction): Promise<void> {
    const botInstance = this.bots.get(botId);
    if (!botInstance) {
      throw new Error('Bot not found or not running');
    }

    const { bot } = botInstance;

    switch (action.action) {
      case 'move':
        await this.handleMovement(botInstance, action.direction, action.distance);
        break;
      case 'look':
        await this.handleLooking(botInstance, action.direction, action.degrees);
        break;
      case 'lookAt':
        await this.handleLookAt(botInstance, action.coordinates);
        break;
      case 'jump':
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 100);
        break;
      case 'sneak':
        bot.setControlState('sneak', action.toggle);
        break;
      case 'mine':
        await this.handleAction(botInstance, 'mine', action.mode, action.interval);
        break;
      case 'attack':
        await this.handleAction(botInstance, 'attack', action.mode, action.interval);
        break;
      case 'rightClick':
        await this.handleAction(botInstance, 'rightClick', action.mode, action.interval);
        break;
      case 'dropItem':
        await this.handleAction(botInstance, 'dropItem', action.mode, action.interval);
        break;
      case 'dropStack':
        await this.handleAction(botInstance, 'dropStack', action.mode, action.interval);
        break;
      case 'sprint':
        await this.handleAction(botInstance, 'sprint', action.mode, action.interval);
        break;
      case 'selectSlot':
        bot.setQuickBarSlot(action.slot);
        break;
      case 'swapOffhand':
        if (bot.heldItem) {
          await bot.moveSlotItem(36 + action.slot, 45); // 36 is quickbar start, 45 is offhand slot
        }
        break;
    }
  }

  private setupBotEventHandlers(botInstance: BotInstance): void {
    const { bot, data } = botInstance;

    bot.once('spawn', async () => {
      const position = bot.entity?.position ? 
        { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z } : 
        { x: 0, y: 0, z: 0 };
      
      await storage.updateBot(data.id, { 
        status: 'online', 
        lastConnected: new Date(),
        position
      });
      
      this.emit('statusChange', data.id, 'online', {
        position,
        health: bot.health,
        food: bot.food
      });

      // Start uptime tracking
      this.startUptimeTracking(botInstance);
      
      // Start inventory monitoring
      this.startInventoryMonitoring(botInstance);
    });

    bot.on('error', async (error) => {
      console.error(`Bot ${data.name} error:`, error);
      await storage.updateBot(data.id, { status: 'error' });
      this.emit('error', data.id, error.message);
      
      // Don't attempt reconnection for certain errors
      if (error.message.includes('unknown chat format code')) {
        console.log(`Bot ${data.name} encountered chat format error, stopping reconnection attempts`);
        this.bots.delete(data.id);
        return;
      }
    });

    bot.on('end', async (reason) => {
      console.log(`Bot ${data.name} disconnected with reason:`, reason);
      await storage.updateBot(data.id, { status: 'offline' });
      this.emit('statusChange', data.id, 'offline');
      
      // Clear intervals
      botInstance.actionIntervals.forEach(interval => clearInterval(interval));
      botInstance.actionIntervals.clear();
      botInstance.continuousActions.clear();
      
      // Remove from active bots when disconnected
      this.bots.delete(data.id);
      
      // Only try to reconnect if it was an unexpected disconnection and not manually stopped
      if (reason !== 'disconnect.quitting' && reason === 'socketClosed') {
        console.log(`Attempting to reconnect bot ${data.name} in 5 seconds`);
        setTimeout(async () => {
          try {
            await this.restartBot(data.id);
          } catch (error) {
            console.error(`Failed to restart bot ${data.name}:`, error);
            // Try again in 10 seconds if first attempt fails
            setTimeout(async () => {
              try {
                await this.restartBot(data.id);
              } catch (retryError) {
                console.error(`Second restart attempt failed for bot ${data.name}:`, retryError);
              }
            }, 10000);
          }
        }, 5000); // Reduced from 10 to 5 seconds
      }
    });

    bot.on('death', () => {
      console.log(`Bot ${data.name} died, respawning...`);
      bot.respawn();
    });

    bot.on('health', async () => {
      await this.updateBotStats(botInstance);
    });

    bot.on('move', async () => {
      if (bot.entity?.position) {
        await storage.updateBot(data.id, {
          position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z }
        });
      }
    });
  }

  private async handleMovement(botInstance: BotInstance, direction: string, distance: number | 'continuous'): Promise<void> {
    const { bot } = botInstance;
    
    if (distance === 'continuous') {
      // Stop other movement
      bot.setControlState('forward', false);
      bot.setControlState('back', false);
      bot.setControlState('left', false);
      bot.setControlState('right', false);
      
      // Start continuous movement
      const controlState = direction === 'forward' ? 'forward' : 
                          direction === 'backward' ? 'back' : 
                          direction === 'left' ? 'left' : 'right';
      bot.setControlState(controlState, true);
    } else {
      // Discrete movement for specified blocks
      if (!bot.entity?.position) {
        throw new Error('Bot entity not available for movement');
      }
      const startPos = bot.entity.position.clone();
      const controlState = direction === 'forward' ? 'forward' : 
                          direction === 'backward' ? 'back' : 
                          direction === 'left' ? 'left' : 'right';
      
      bot.setControlState(controlState, true);
      
      const checkDistance = () => {
        if (!bot.entity?.position) {
          bot.setControlState(controlState, false);
          return;
        }
        const currentPos = bot.entity.position;
        const distanceMoved = startPos.distanceTo(currentPos);
        
        if (distanceMoved >= distance) {
          bot.setControlState(controlState, false);
        } else {
          setTimeout(checkDistance, 50);
        }
      };
      
      setTimeout(checkDistance, 50);
    }
  }

  private async handleLooking(botInstance: BotInstance, direction: string, degrees: number): Promise<void> {
    const { bot } = botInstance;
    if (!bot.entity) {
      throw new Error('Bot entity not available for looking');
    }
    
    const radians = (degrees * Math.PI) / 180;
    
    let newYaw = bot.entity.yaw;
    let newPitch = bot.entity.pitch;
    
    switch (direction) {
      case 'left':
        newYaw -= radians;
        break;
      case 'right':
        newYaw += radians;
        break;
      case 'up':
        newPitch -= radians;
        break;
      case 'down':
        newPitch += radians;
        break;
    }
    
    await bot.look(newYaw, newPitch);
  }

  private async handleLookAt(botInstance: BotInstance, coordinates: { x: number; y: number; z: number }): Promise<void> {
    const { bot } = botInstance;
    if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number' || typeof coordinates.z !== 'number') {
      throw new Error('Invalid coordinates provided for lookAt');
    }
    const target = new Vec3(coordinates.x, coordinates.y, coordinates.z);
    await bot.lookAt(target);
  }

  private async handleAction(botInstance: BotInstance, actionType: string, mode: string, interval?: number): Promise<void> {
    const { bot } = botInstance;
    
    // Clear existing action of this type
    const existingInterval = botInstance.actionIntervals.get(actionType);
    if (existingInterval) {
      clearInterval(existingInterval);
      botInstance.actionIntervals.delete(actionType);
    }
    botInstance.continuousActions.delete(actionType);

    if (mode === 'stop') {
      if (actionType === 'sprint') {
        bot.setControlState('sprint', false);
      } else if (actionType === 'sneak') {
        bot.setControlState('sneak', false);
      }
      return;
    }

    const executeAction = async () => {
      switch (actionType) {
        case 'mine':
          bot.swingArm('right');
          // Find block to mine/break
          const targetBlock = bot.blockAtCursor(5); // Look for block within 5 blocks
          if (targetBlock) {
            try {
              await bot.dig(targetBlock);
            } catch (error) {
              // If can't dig, just swing
              console.log(`Cannot dig block: ${(error as Error).message}`);
            }
          }
          break;
        case 'attack':
          bot.swingArm('right');
          // Look for entity to attack
          const entity = bot.entity?.position ? 
            bot.nearestEntity(e => e.type === 'mob' && bot.entity!.position.distanceTo(e.position) < 5) : 
            null;
          if (entity) {
            await bot.attack(entity);
          }
          break;
        case 'rightClick':
          // Enhanced right click - handles chests, villagers, eating, placing blocks
          const blockToInteract = bot.blockAtCursor(5);
          if (blockToInteract) {
            // Try to interact with block (chest, door, etc.)
            try {
              await bot.activateBlock(blockToInteract);
            } catch (error) {
              // If interaction fails, try to place block
              if (bot.heldItem) {
                try {
                  const faceVector = new Vec3(0, 1, 0);
                  await bot.placeBlock(blockToInteract, faceVector);
                } catch (placeError) {
                  console.log(`Cannot place block: ${(placeError as Error).message}`);
                  bot.activateItem(); // Fallback to using item
                }
              } else {
                bot.activateItem();
              }
            }
          } else {
            // Try to interact with entity (villager)
            const villager = bot.entity?.position ? 
              bot.nearestEntity(e => e.name === 'villager' && bot.entity!.position.distanceTo(e.position) < 5) : 
              null;
            if (villager) {
              try {
                await bot.useOn(villager);
              } catch (error) {
                console.log(`Cannot interact with villager: ${(error as Error).message}`);
              }
            } else {
              // Use item (eat food, use tool, etc.)
              bot.activateItem();
            }
          }
          break;
        case 'dropItem':
          if (bot.heldItem) {
            await bot.toss(bot.heldItem.type, null, 1); // Drop only 1 item
          }
          break;
        case 'dropStack':
          if (bot.heldItem) {
            await bot.toss(bot.heldItem.type, null, bot.heldItem.count); // Drop entire stack
          }
          break;
        case 'sprint':
          bot.setControlState('sprint', true);
          break;
        case 'jump':
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 100);
          break;
        case 'sneak':
          bot.setControlState('sneak', true);
          break;
      }
    };

    switch (mode) {
      case 'once':
        await executeAction();
        break;
      case 'continuous':
        botInstance.continuousActions.add(actionType);
        if (actionType === 'sprint') {
          bot.setControlState('sprint', true);
        } else if (actionType === 'sneak') {
          bot.setControlState('sneak', true);
        } else if (actionType === 'jump') {
          // Jump continuously every 500ms
          const jumpInterval = setInterval(() => {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 100);
          }, 500);
          botInstance.actionIntervals.set(actionType, jumpInterval);
        } else {
          await executeAction();
          const continuousInterval = setInterval(() => executeAction(), 50); // 20 ticks per second
          botInstance.actionIntervals.set(actionType, continuousInterval);
        }
        break;
      case 'interval':
        if (interval && interval > 0) {
          const intervalMs = (interval / 20) * 1000; // Convert game ticks to milliseconds
          const actionInterval = setInterval(() => executeAction(), intervalMs);
          botInstance.actionIntervals.set(actionType, actionInterval);
        }
        break;
    }
  }

  private startUptimeTracking(botInstance: BotInstance): void {
    const updateUptime = async () => {
      const uptime = Math.floor((Date.now() - botInstance.startTime.getTime()) / 1000);
      await storage.updateBot(botInstance.data.id, { uptime });
    };

    // Update uptime every 30 seconds
    const uptimeInterval = setInterval(updateUptime, 30000);
    botInstance.actionIntervals.set('uptime', uptimeInterval);
  }

  private startInventoryMonitoring(botInstance: BotInstance): void {
    const { bot } = botInstance;
    
    const updateInventory = async () => {
      const inventory = [];
      
      // Hotbar (slots 36-44)
      for (let i = 36; i <= 44; i++) {
        const item = bot.inventory.slots[i];
        if (item) {
          inventory.push({
            slot: i - 36, // Convert to 0-8 for hotbar
            name: item.name,
            count: item.count,
            displayName: item.displayName || item.name,
          });
        }
      }
      
      // Offhand (slot 45)
      const offhandItem = bot.inventory.slots[45];
      if (offhandItem) {
        inventory.push({
          slot: 9, // Offhand slot
          name: offhandItem.name,
          count: offhandItem.count,
          displayName: offhandItem.displayName || offhandItem.name,
        });
      }
      
      await storage.updateBot(botInstance.data.id, { inventory });
      this.emit('inventoryUpdate', botInstance.data.id, inventory);
    };

    // Monitor inventory changes
    const inventoryInterval = setInterval(updateInventory, 5000); // Check every 5 seconds
    botInstance.actionIntervals.set('inventory', inventoryInterval);
    updateInventory(); // Initial update
  }

  private async updateBotStats(botInstance: BotInstance): Promise<void> {
    const { bot } = botInstance;
    await storage.updateBot(botInstance.data.id, {
      health: bot.health,
      food: bot.food,
    });
    
    this.emit('statusChange', botInstance.data.id, 'online', {
      health: bot.health,
      food: bot.food,
    });
  }

  private async restartBot(botId: string): Promise<void> {
    const botData = await storage.getBot(botId);
    if (botData && botData.status !== 'offline') {
      try {
        await this.startBot(botData);
      } catch (error) {
        console.error(`Failed to restart bot ${botData.name}:`, error);
      }
    }
  }
}
