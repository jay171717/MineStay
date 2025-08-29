import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Trash2, 
  Play, 
  Square, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  User,
  Box,
  Gamepad2
} from "lucide-react";
import type { Bot, BotAction, WSMessage } from "@shared/schema";

export default function BotManager() {
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [isAddBotOpen, setIsAddBotOpen] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  
  // Movement controls
  const [movementDistance, setMovementDistance] = useState<string>("1");
  const [customDistance, setCustomDistance] = useState<string>("");
  const [rotationDegrees, setRotationDegrees] = useState<string>("15");
  const [lookAtCoords, setLookAtCoords] = useState({ x: "", y: "", z: "" });
  
  // Action states
  const [actionModes, setActionModes] = useState<Record<string, string>>({});
  const [actionIntervals, setActionIntervals] = useState<Record<string, string>>({});
  
  // Inventory management
  const [selectedHotbarSlot, setSelectedHotbarSlot] = useState<number>(0);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bots
  const { data: initialBots, isLoading } = useQuery({
    queryKey: ["/api/bots"],
    queryFn: async () => {
      const response = await fetch("/api/bots");
      if (!response.ok) throw new Error("Failed to fetch bots");
      return response.json() as Promise<Bot[]>;
    },
  });

  // WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to WebSocket");
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      setSocket(null);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Initialize bots from API
  useEffect(() => {
    if (initialBots) {
      setBots(initialBots);
    }
  }, [initialBots]);

  const handleWebSocketMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "bot_status":
        setBots(prev => prev.map(bot => 
          bot.id === message.data.botId 
            ? { 
                ...bot, 
                status: message.data.status,
                ...(message.data.position && { position: message.data.position }),
                ...(message.data.health !== undefined && { health: message.data.health }),
                ...(message.data.food !== undefined && { food: message.data.food }),
                ...(message.data.uptime !== undefined && { uptime: message.data.uptime }),
              }
            : bot
        ));
        break;
      case "bot_inventory":
        setBots(prev => prev.map(bot => 
          bot.id === message.data.botId 
            ? { ...bot, inventory: message.data.inventory }
            : bot
        ));
        break;
      case "bot_created":
        setBots(prev => [...prev, message.data.bot as Bot]);
        break;
      case "bot_deleted":
        setBots(prev => prev.filter(bot => bot.id !== message.data.botId));
        if (selectedBotId === message.data.botId) {
          setSelectedBotId(null);
        }
        break;
      case "error":
        toast({
          title: "Bot Error",
          description: message.data.message,
          variant: "destructive",
        });
        break;
    }
  }, [selectedBotId, toast]);

  // Mutations
  const createBotMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/bots", { name });
      return response.json();
    },
    onSuccess: () => {
      setIsAddBotOpen(false);
      setNewBotName("");
      toast({ title: "Bot created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create bot", variant: "destructive" });
    },
  });

  const startBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      await apiRequest("POST", `/api/bots/${botId}/start`);
    },
    onSuccess: () => {
      toast({ title: "Bot start initiated" });
    },
    onError: () => {
      toast({ title: "Failed to start bot", variant: "destructive" });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      await apiRequest("POST", `/api/bots/${botId}/stop`);
    },
    onSuccess: () => {
      toast({ title: "Bot stopped" });
    },
    onError: () => {
      toast({ title: "Failed to stop bot", variant: "destructive" });
    },
  });

  const deleteBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      await apiRequest("DELETE", `/api/bots/${botId}`);
    },
    onSuccess: () => {
      toast({ title: "Bot deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete bot", variant: "destructive" });
    },
  });

  const executeActionMutation = useMutation({
    mutationFn: async ({ botId, action }: { botId: string; action: BotAction }) => {
      await apiRequest("POST", `/api/bots/${botId}/action`, action);
    },
    onSuccess: () => {
      toast({ title: "Action executed" });
    },
    onError: () => {
      toast({ title: "Failed to execute action", variant: "destructive" });
    },
  });

  const selectedBot = bots.find(bot => bot.id === selectedBotId);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "text-green-500";
      case "offline": return "text-red-500";
      case "connecting": return "text-yellow-500";
      case "error": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const handleMovement = (direction: "forward" | "backward" | "left" | "right") => {
    if (!selectedBotId) return;
    
    const distance = movementDistance === "custom" ? parseInt(customDistance) || 1 : 
                    movementDistance === "continuous" ? "continuous" as const : 
                    parseInt(movementDistance);

    executeActionMutation.mutate({
      botId: selectedBotId,
      action: { action: "move", direction, distance }
    });
  };

  const handleLooking = (direction: "up" | "down" | "left" | "right") => {
    if (!selectedBotId) return;
    
    executeActionMutation.mutate({
      botId: selectedBotId,
      action: { action: "look", direction, degrees: parseInt(rotationDegrees) || 15 }
    });
  };

  const handleLookAt = () => {
    if (!selectedBotId) return;
    
    const x = parseInt(lookAtCoords.x);
    const y = parseInt(lookAtCoords.y);
    const z = parseInt(lookAtCoords.z);
    
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      toast({ title: "Invalid coordinates", variant: "destructive" });
      return;
    }

    executeActionMutation.mutate({
      botId: selectedBotId,
      action: { action: "lookAt", coordinates: { x, y, z } }
    });
  };

  const handleQuickAction = (action: "jump" | "sneak") => {
    if (!selectedBotId) return;
    
    if (action === "jump") {
      executeActionMutation.mutate({
        botId: selectedBotId,
        action: { action: "jump" }
      });
    } else {
      executeActionMutation.mutate({
        botId: selectedBotId,
        action: { action: "sneak", toggle: true }
      });
    }
  };

  const handleActionExecution = (actionType: string) => {
    if (!selectedBotId) return;
    
    const mode = actionModes[actionType] || "once";
    const interval = parseInt(actionIntervals[actionType]) || 10;

    const actionMap: Record<string, any> = {
      mine: { action: "mine", mode, interval },
      attack: { action: "attack", mode, interval },
      rightClick: { action: "rightClick", mode, interval },
      dropItem: { action: "dropItem", mode, interval },
      dropStack: { action: "dropStack", mode, interval },
      sprint: { action: "sprint", mode, interval },
      jump: { action: "jump" },
      sneak: { action: "sneak", toggle: mode !== "stop" },
    };

    const action = actionMap[actionType];
    if (action) {
      executeActionMutation.mutate({ botId: selectedBotId, action });
    }
  };

  const setActionMode = (actionType: string, mode: string) => {
    setActionModes(prev => ({ ...prev, [actionType]: mode }));
  };

  const handleHotbarSelect = (slot: number) => {
    if (!selectedBotId) return;
    setSelectedHotbarSlot(slot);
    executeActionMutation.mutate({
      botId: selectedBotId,
      action: { action: "selectSlot", slot }
    });
  };

  const handleOffhandSwap = () => {
    if (!selectedBotId) return;
    executeActionMutation.mutate({
      botId: selectedBotId,
      action: { action: "swapOffhand", slot: selectedHotbarSlot }
    });
  };

  const renderInventorySlot = (item: any, index: number, isOffhand: boolean = false) => (
    <div 
      key={index}
      className={`w-10 h-10 border-2 rounded flex items-center justify-center relative text-xs cursor-pointer transition-all ${
        item ? 'bg-secondary border-primary' : 'bg-muted border-border'
      } ${
        !isOffhand && index === selectedHotbarSlot ? 'ring-2 ring-blue-500 ring-offset-2' : ''
      } hover:border-blue-400`}
      onClick={() => !isOffhand && handleHotbarSelect(index)}
      data-testid={`inventory-slot-${index}`}
    >
      {item && (
        <>
          <span className="text-[8px] text-center leading-none">{item.displayName || item.name}</span>
          <span className="absolute bottom-0 right-0 text-[8px] font-bold bg-background px-0.5 rounded">
            {item.count}
          </span>
        </>
      )}
    </div>
  );

  const renderActionControls = (actionType: string, label: string) => {
    const currentMode = actionModes[actionType] || "once";
    const currentInterval = actionIntervals[actionType] || "10";

    return (
      <div className="border border-border rounded p-3" data-testid={`action-${actionType}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm">{label}</span>
          <div className="flex gap-1">
            {["once", "interval", "continuous", "stop"].map(mode => (
              <Button
                key={mode}
                size="sm"
                variant={currentMode === mode ? "default" : "secondary"}
                className="px-2 py-1 text-xs"
                onClick={() => setActionMode(actionType, mode)}
                data-testid={`action-mode-${actionType}-${mode}`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Game ticks"
            value={currentInterval}
            onChange={(e) => setActionIntervals(prev => ({ ...prev, [actionType]: e.target.value }))}
            className="flex-1 text-xs"
            disabled={currentMode === "continuous"}
            data-testid={`action-interval-${actionType}`}
          />
          <Button
            size="sm"
            onClick={() => handleActionExecution(actionType)}
            className="text-xs"
            data-testid={`action-execute-${actionType}`}
          >
            Execute
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Box className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading bots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Box className="h-6 w-6" />
            Minecraft Bot Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Server: fakesalmon.aternos.me | Version: 1.21.4
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Bot List */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Active Bots</h2>
              <Dialog open={isAddBotOpen} onOpenChange={setIsAddBotOpen}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2" data-testid="button-add-bot">
                    <Plus className="h-4 w-4" />
                    Add Bot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Bot</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="bot-name">Bot Name</Label>
                      <Input
                        id="bot-name"
                        value={newBotName}
                        onChange={(e) => setNewBotName(e.target.value)}
                        placeholder="Enter bot name"
                        data-testid="input-bot-name"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" onClick={() => setIsAddBotOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => createBotMutation.mutate(newBotName)}
                        disabled={!newBotName.trim() || createBotMutation.isPending}
                        data-testid="button-create-bot"
                      >
                        Create Bot
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="space-y-2">
              {bots.map((bot) => (
                <div
                  key={bot.id}
                  className={`p-3 rounded-md border cursor-pointer transition-all hover:bg-secondary ${
                    selectedBotId === bot.id ? 'bg-primary/10 border-primary' : 'border-border'
                  }`}
                  onClick={() => setSelectedBotId(bot.id)}
                  data-testid={`bot-item-${bot.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(bot.status)} relative`}>
                        {bot.status === 'connecting' && (
                          <div className="absolute inset-0 rounded-full border-2 border-yellow-500 animate-pulse" />
                        )}
                      </div>
                      <span className="font-medium">{bot.name}</span>
                      <span className={`text-sm px-2 py-1 rounded-md text-xs font-medium ${
                        bot.status === 'online' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        bot.status === 'connecting' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        bot.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      }`}>
                        {bot.status === 'online' ? `Online • ${formatUptime(bot.uptime || 0)}` : 
                         bot.status === 'connecting' ? 'Connecting...' :
                         bot.status === 'error' ? 'Connection Error' :
                         'Offline'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={bot.status === 'online' ? 'destructive' : 'default'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (bot.status === 'online') {
                            stopBotMutation.mutate(bot.id);
                          } else {
                            startBotMutation.mutate(bot.id);
                          }
                        }}
                        disabled={bot.status === 'connecting'}
                        data-testid={`button-toggle-bot-${bot.id}`}
                      >
                        {bot.status === 'online' ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {bot.status === 'online' ? 'Stop' : bot.status === 'connecting' ? 'Connecting' : 'Start'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBotMutation.mutate(bot.id);
                        }}
                        data-testid={`button-delete-bot-${bot.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {bots.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No bots created yet. Click "Add Bot" to get started.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bot Controller */}
        {selectedBot && (
          <Card>
            <CardContent className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5 text-primary" />
                  {selectedBot.name} Control Panel
                </h2>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span>
                    Position: 
                    <span className="font-mono ml-1">
                      {selectedBot.position 
                        ? `X: ${Math.round(selectedBot.position.x)}, Y: ${Math.round(selectedBot.position.y)}, Z: ${Math.round(selectedBot.position.z)}`
                        : "Unknown"
                      }
                    </span>
                  </span>
                  <span>Health: <span className="text-green-500">{selectedBot.health}/20</span></span>
                  <span>Food: <span className="text-green-500">{selectedBot.food}/20</span></span>
                </div>
              </div>

              {/* Inventory Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-3">Inventory</h3>
                <div className="bg-muted/30 p-4 rounded-lg">
                  <div className="mb-3">
                    <p className="text-sm text-muted-foreground mb-2">Hotbar</p>
                    <div className="flex gap-1">
                      {Array.from({ length: 9 }, (_, i) => {
                        const item = selectedBot.inventory?.find(item => item.slot === i);
                        return renderInventorySlot(item, i, false);
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm text-muted-foreground">Offhand</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={handleOffhandSwap}
                        data-testid="button-swap-offhand"
                      >
                        Swap
                      </Button>
                    </div>
                    {(() => {
                      const offhandItem = selectedBot.inventory?.find(item => item.slot === 9);
                      return renderInventorySlot(offhandItem, 9, true);
                    })()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Movement & Looking Section */}
                <div className="bg-muted/30 p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-4">Movement & Looking</h3>
                  
                  {/* Movement Controls */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Movement (WASD)</p>
                    <div className="grid grid-cols-3 gap-2 w-fit mx-auto mb-3">
                      <div></div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleMovement("forward")}
                        data-testid="button-move-forward"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <div></div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleMovement("left")}
                        data-testid="button-move-left"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleMovement("backward")}
                        data-testid="button-move-backward"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleMovement("right")}
                        data-testid="button-move-right"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Distance</Label>
                        <Select value={movementDistance} onValueChange={setMovementDistance}>
                          <SelectTrigger className="w-full text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Block</SelectItem>
                            <SelectItem value="5">5 Blocks</SelectItem>
                            <SelectItem value="10">10 Blocks</SelectItem>
                            <SelectItem value="continuous">Continuous</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {movementDistance === "custom" && (
                        <Input
                          type="number"
                          placeholder="Custom blocks"
                          value={customDistance}
                          onChange={(e) => setCustomDistance(e.target.value)}
                          className="text-sm"
                          data-testid="input-custom-distance"
                        />
                      )}
                    </div>
                  </div>

                  {/* Looking Controls */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Looking Direction</p>
                    <div className="grid grid-cols-3 gap-2 w-fit mx-auto mb-3">
                      <div></div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleLooking("up")}
                        data-testid="button-look-up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <div></div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleLooking("left")}
                        data-testid="button-look-left"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleLooking("right")}
                        data-testid="button-look-right"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <div></div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-10 h-10"
                        onClick={() => handleLooking("down")}
                        data-testid="button-look-down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <div></div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Rotation Degrees</Label>
                        <Input
                          type="number"
                          value={rotationDegrees}
                          onChange={(e) => setRotationDegrees(e.target.value)}
                          min="1"
                          max="90"
                          className="text-sm"
                          data-testid="input-rotation-degrees"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="X"
                          value={lookAtCoords.x}
                          onChange={(e) => setLookAtCoords(prev => ({ ...prev, x: e.target.value }))}
                          className="flex-1 text-sm"
                          data-testid="input-look-at-x"
                        />
                        <Input
                          type="number"
                          placeholder="Y"
                          value={lookAtCoords.y}
                          onChange={(e) => setLookAtCoords(prev => ({ ...prev, y: e.target.value }))}
                          className="flex-1 text-sm"
                          data-testid="input-look-at-y"
                        />
                        <Input
                          type="number"
                          placeholder="Z"
                          value={lookAtCoords.z}
                          onChange={(e) => setLookAtCoords(prev => ({ ...prev, z: e.target.value }))}
                          className="flex-1 text-sm"
                          data-testid="input-look-at-z"
                        />
                        <Button size="sm" onClick={handleLookAt} data-testid="button-look-at">
                          Look At
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Quick Actions</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleQuickAction("jump")}
                        className="flex items-center gap-1"
                        data-testid="button-jump"
                      >
                        <ArrowUp className="h-4 w-4" />
                        Jump
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleQuickAction("sneak")}
                        className="flex items-center gap-1"
                        data-testid="button-sneak"
                      >
                        <User className="h-4 w-4" />
                        Sneak
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Actions Section */}
                <div className="bg-muted/30 p-4 rounded-lg">
                  <h3 className="text-lg font-medium mb-4">Actions</h3>
                  
                  <div className="space-y-4">
                    {renderActionControls("mine", "Mine")}
                    {renderActionControls("attack", "Attack")}
                    {renderActionControls("rightClick", "Right Click")}
                    {renderActionControls("dropItem", "Drop Item")}
                    {renderActionControls("dropStack", "Drop Stack")}
                    {renderActionControls("sprint", "Sprint")}
                    {renderActionControls("jump", "Jump")}
                    {renderActionControls("sneak", "Sneak")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!selectedBot && bots.length > 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Gamepad2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Select a Bot</h3>
              <p className="text-muted-foreground">
                Click on a bot from the list above to access its control panel
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
