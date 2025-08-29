# Overview

This is a Minecraft bot management application that allows users to create and control multiple Minecraft bots on a server. The application provides a web interface for managing bots, sending commands, and monitoring their status in real-time. Users can perform various actions like movement, rotation, inventory management, and automated behaviors through an intuitive dashboard.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with a dark theme configuration
- **State Management**: TanStack Query for server state and React hooks for local state
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Communication**: WebSocket connection for live bot status updates

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Bot Engine**: Mineflayer library for Minecraft bot automation
- **Real-time Communication**: WebSocket server using the 'ws' library
- **Storage**: In-memory storage with interface design for future database integration
- **API Design**: RESTful endpoints with WebSocket for real-time features

## Data Storage Solutions
- **Current**: In-memory storage using Maps for development
- **Database Ready**: Drizzle ORM configured for PostgreSQL with Neon serverless
- **Schema**: Defined tables for users and bots with proper typing
- **Migration System**: Drizzle Kit for database schema management

## Authentication and Authorization
- **Current State**: Basic structure in place but not fully implemented
- **Session Management**: Connect-pg-simple for PostgreSQL session storage
- **User System**: User schema defined with username/password fields

## External Service Integrations
- **Minecraft Server**: Connects to "fakesalmon.aternos.me" on port 25565
- **Bot Protocol**: Minecraft 1.21.4 with offline mode authentication
- **Real-time Updates**: WebSocket broadcasting for bot status, inventory, and position changes
- **Development Tools**: Replit integration with cartographer and runtime error overlay

## Key Architectural Decisions

### Monorepo Structure
- **Problem**: Organizing full-stack TypeScript application
- **Solution**: Shared schema and types between client/server with path aliases
- **Benefits**: Type safety across boundaries, reduced duplication

### Real-time Communication
- **Problem**: Need for live bot status updates and command execution
- **Solution**: WebSocket connection alongside REST API
- **Benefits**: Immediate feedback, real-time monitoring capabilities

### Bot Management Service
- **Problem**: Managing multiple Minecraft bot instances simultaneously
- **Solution**: Event-driven MinecraftBotService with bot lifecycle management
- **Benefits**: Scalable bot operations, centralized event handling

### UI Component System
- **Problem**: Consistent and accessible UI components
- **Solution**: Shadcn/ui with Radix UI primitives and Tailwind CSS
- **Benefits**: Accessibility, consistency, rapid development

### Development Environment
- **Problem**: Full-stack development with build optimization
- **Solution**: Vite for frontend, tsx for backend development, esbuild for production
- **Benefits**: Fast HMR, TypeScript support, optimized builds