import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertBotSchema, botActionSchema, type WSMessage } from "@shared/schema";
import { MinecraftBotService } from "./services/minecraft-bot";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const botService = new MinecraftBotService();
  
  // Store WebSocket connections
  const clients = new Set<WebSocket>();

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected to WebSocket');

    ws.on('close', () => {
      clients.delete(ws);
      console.log('Client disconnected from WebSocket');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  // Broadcast message to all connected clients
  function broadcast(message: WSMessage) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // Set up bot service event handlers
  botService.on('statusChange', (botId: string, status: string, data?: any) => {
    broadcast({
      type: 'bot_status',
      data: { botId, status: status as any, ...data }
    });
  });

  botService.on('inventoryUpdate', (botId: string, inventory: any[]) => {
    broadcast({
      type: 'bot_inventory',
      data: { botId, inventory }
    });
  });

  botService.on('error', (botId: string, message: string) => {
    broadcast({
      type: 'error',
      data: { message, botId }
    });
  });

  // API Routes
  app.get("/api/bots", async (req, res) => {
    try {
      const bots = await storage.getAllBots();
      res.json(bots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bots" });
    }
  });

  app.post("/api/bots", async (req, res) => {
    try {
      const data = insertBotSchema.parse(req.body);
      const bot = await storage.createBot(data);
      
      broadcast({
        type: 'bot_created',
        data: { bot: { id: bot.id, name: bot.name, status: bot.status, uptime: bot.uptime || 0 } }
      });
      
      res.json(bot);
    } catch (error) {
      res.status(400).json({ message: "Invalid bot data" });
    }
  });

  app.post("/api/bots/:id/start", async (req, res) => {
    try {
      const { id } = req.params;
      const bot = await storage.getBot(id);
      
      if (!bot) {
        return res.status(404).json({ message: "Bot not found" });
      }

      await botService.startBot(bot);
      res.json({ message: "Bot start initiated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to start bot" });
    }
  });

  app.post("/api/bots/:id/stop", async (req, res) => {
    try {
      const { id } = req.params;
      await botService.stopBot(id);
      res.json({ message: "Bot stopped" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop bot" });
    }
  });

  app.delete("/api/bots/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await botService.stopBot(id);
      const deleted = await storage.deleteBot(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Bot not found" });
      }

      broadcast({
        type: 'bot_deleted',
        data: { botId: id }
      });
      
      res.json({ message: "Bot deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete bot" });
    }
  });

  app.post("/api/bots/:id/action", async (req, res) => {
    try {
      const { id } = req.params;
      const action = botActionSchema.parse(req.body);
      
      await botService.executeAction(id, action);
      res.json({ message: "Action executed" });
    } catch (error) {
      res.status(400).json({ message: "Invalid action or bot not found" });
    }
  });

  return httpServer;
}
