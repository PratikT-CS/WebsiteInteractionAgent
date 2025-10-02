from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field   
from typing import Dict, Any, Union, Optional, List
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.managed import IsLastStep, RemainingSteps
import json
import dotenv
import asyncio
import uuid
from datetime import datetime, timedelta
from collections import defaultdict, deque

dotenv.load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Client-Side Tool Agent", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.tool_queue: List[Dict[str, Any]] = []

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"Client {client_id} connected")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"Client {client_id} disconnected")

    def queue_tool_for_client(self, client_id: str, tool_name: str, args: Dict[str, Any]):
        """Queue tool execution request for frontend client (thread-safe)"""
        tool_data = {
            "client_id": client_id,
            "tool": tool_name,
            "args": args,
            "timestamp": datetime.now().isoformat()
        }
        self.tool_queue.append(tool_data)
        print(f"Queued tool {tool_name} for client {client_id}")

    async def process_tool_queue(self):
        """Process queued tools and send via WebSocket"""
        while self.tool_queue:
            tool_data = self.tool_queue.pop(0)
            client_id = tool_data["client_id"]
            
            if client_id in self.active_connections:
                await self.active_connections[client_id].send_text(json.dumps({
                    "tool": tool_data["tool"],
                    "args": tool_data["args"],
                    "timestamp": tool_data["timestamp"]
                }))
                print(f"Sent tool {tool_data['tool']} to client {client_id}")

# Global connection manager
manager = ConnectionManager()

# Store current client ID for tool execution
current_client_id = None

# Memory Management System
class MemoryManager:
    def __init__(self, max_messages_per_session: int = 20, session_timeout_hours: int = 1):
        """
        Initialize memory manager for storing conversation history.
        
        Args:
            max_messages_per_session: Maximum number of messages to keep per session
            session_timeout_hours: Hours after which a session expires
        """
        self.max_messages_per_session = max_messages_per_session
        self.session_timeout_hours = session_timeout_hours
        self.sessions: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'messages': deque(maxlen=max_messages_per_session),
            'last_activity': datetime.now(),
            'session_id': None
        })
    
    def get_or_create_session(self, client_id: str) -> str:
        """Get existing session or create new one for client."""
        session_data = self.sessions[client_id]
        
        # Check if session has expired
        if (datetime.now() - session_data['last_activity']).total_seconds() > (self.session_timeout_hours * 3600):
            # Session expired, create new one
            session_data['messages'].clear()
            session_data['session_id'] = str(uuid.uuid4())
        
        # Create session ID if it doesn't exist
        if not session_data['session_id']:
            session_data['session_id'] = str(uuid.uuid4())
        
        # Update last activity
        session_data['last_activity'] = datetime.now()
        
        return session_data['session_id']
    
    def add_message(self, client_id: str, message: Union[HumanMessage, AIMessage, SystemMessage]):
        """Add a message to the client's conversation history."""
        session_data = self.sessions[client_id]
        session_data['messages'].append({
            'type': message.__class__.__name__,
            'content': message.content,
            'timestamp': datetime.now().isoformat()
        })
        session_data['last_activity'] = datetime.now()
    
    def get_conversation_history(self, client_id: str) -> List[Union[HumanMessage, AIMessage, SystemMessage]]:
        """Get conversation history for a client as LangChain messages."""
        session_data = self.sessions[client_id]
        messages = []
        
        for msg_data in session_data['messages']:
            if msg_data['type'] == 'HumanMessage':
                messages.append(HumanMessage(content=msg_data['content']))
            elif msg_data['type'] == 'AIMessage':
                messages.append(AIMessage(content=msg_data['content']))
            elif msg_data['type'] == 'SystemMessage':
                messages.append(SystemMessage(content=msg_data['content']))
        
        return messages
    
    def get_conversation_summary(self, client_id: str) -> str:
        """Get a brief summary of the conversation for context."""
        session_data = self.sessions[client_id]
        messages = list(session_data['messages'])
        
        if not messages:
            return "No previous conversation history."
        
        # Get last few messages for context
        recent_messages = messages[-6:] if len(messages) > 6 else messages
        
        summary_parts = []
        for msg in recent_messages:
            if msg['type'] == 'HumanMessage':
                summary_parts.append(f"User: {msg['content'][:100]}...")
            elif msg['type'] == 'AIMessage':
                summary_parts.append(f"Assistant: {msg['content'][:100]}...")
        
        return "Recent conversation:\n" + "\n".join(summary_parts)
    
    def clear_session(self, client_id: str):
        """Clear conversation history for a client."""
        if client_id in self.sessions:
            self.sessions[client_id]['messages'].clear()
            self.sessions[client_id]['session_id'] = str(uuid.uuid4())
    
    def cleanup_expired_sessions(self):
        """Remove expired sessions to free memory."""
        current_time = datetime.now()
        expired_clients = []
        
        for client_id, session_data in self.sessions.items():
            if (current_time - session_data['last_activity']).total_seconds() > (self.session_timeout_hours * 3600):
                expired_clients.append(client_id)
        
        for client_id in expired_clients:
            del self.sessions[client_id]
            print(f"Cleaned up expired session for client: {client_id}")

# Global memory manager
memory_manager = MemoryManager()

# Request/Response models
class AgentRequest(BaseModel):
    query: str
    client_id: Optional[str] = None

class AgentResponse(BaseModel):
    content: str = Field(..., description="Response to the user's query")


# Define tools - These will queue WebSocket messages for frontend
@tool
def highlight_element(selector: str, duration: int = 2000) -> str:
    """Highlight an element on the page for a specified duration.
    
    Args:
        selector: CSS selector for the element to highlight
        duration: Duration in milliseconds to highlight the element
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "highlight_element", 
            {"selector": selector, "duration": duration}
        )
    return f"Highlighting element {selector} for {duration}ms"

@tool
def fill_input(selector: str, value: str) -> str:
    """Fill an input field with a specified value.
    
    Args:
        selector: CSS selector for the input element
        value: Value to fill in the input field
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "fill_input", 
            {"selector": selector, "value": value}
        )
    return f"Filling input {selector} with value '{value}'"

@tool   
def navigate_to_page(path: str) -> str:
    """Navigate to a specified page.
    
    Args:
        path: Path to navigate to
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "navigate_to_page", 
            {"path": path}
        )
    return f"Navigating to {path}"

@tool
def click_element(selector: str) -> str:
    """Click an element on the page.
    
    Args:
        selector: CSS selector for the element to click
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "click_element", 
            {"selector": selector}
        )
    return f"Clicking element {selector}"

@tool
def wait_for_element(selector: str, timeout: int = 5000) -> str:
    """Wait for an element to appear on the page.
    
    Args:
        selector: CSS selector for the element to wait for
        timeout: Timeout in milliseconds
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "wait_for_element", 
            {"selector": selector, "timeout": timeout}
        )
    return f"Waiting for element {selector} with timeout {timeout}ms"

@tool
def scroll_to_element(selector: str) -> str:
    """Scroll to an element on the page.
    
    Args:
        selector: CSS selector for the element to scroll to
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "scroll_to_element", 
            {"selector": selector}
        )
    return f"Scrolling to element {selector}"

@tool
def get_element_text(selector: str) -> str:
    """Get text content from an element.
    
    Args:
        selector: CSS selector for the element
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "get_element_text", 
            {"selector": selector}
        )
    return f"Getting text from element {selector}"

@tool
def take_screenshot(filename: str = None) -> str:
    """Take a screenshot of the current page.
    
    Args:
        filename: Optional filename for the screenshot
    """
    if current_client_id:
        manager.queue_tool_for_client(
            current_client_id, 
            "take_screenshot", 
            {"filename": filename}
        )
    return f"Taking screenshot{' with filename ' + filename if filename else ''}"

# Initialize the LLM
def get_llm():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable is not set")
    
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.1,
        google_api_key=api_key
    )

# Create the ReAct agent with tools
try:
    llm = get_llm()
    tools = [
        highlight_element, fill_input, navigate_to_page, click_element,
        wait_for_element, scroll_to_element, get_element_text, take_screenshot
    ]
    agent = create_react_agent(llm, tools)
    # Set recursion limit to prevent infinite loops
    # agent.config = {"recursion_limit": 10}
    print("✅ ReAct agent initialized successfully")
except Exception as e:
    print(f"❌ Failed to initialize agent: {e}")
    agent = None

@app.post("/agent", response_model=AgentResponse)
async def agent_endpoint(request: AgentRequest):
    """Process a query through the LangGraph ReAct agent with memory."""
    global current_client_id
    
    try:
        # Check if agent is initialized
        if agent is None:
            raise HTTPException(
                status_code=500, 
                detail="Agent not initialized. Please check GOOGLE_API_KEY environment variable."
            )
        
        # Set the current client ID for tool execution
        if request.client_id:
            current_client_id = request.client_id
            # Get or create session for this client
            session_id = memory_manager.get_or_create_session(request.client_id)
            print(f"Using session {session_id} for client {request.client_id}")
        
        # Get conversation history for context
        conversation_history = []
        conversation_summary = ""
        
        if request.client_id:
            conversation_history = memory_manager.get_conversation_history(request.client_id)
            conversation_summary = memory_manager.get_conversation_summary(request.client_id)
        
        # Create system message with memory context
        system_prompt = """
You are a Website Interaction Agent designed to help users interact with a website by navigating, filling inputs, and clicking buttons.  

Your responses will be converted into speech, so always make them natural, friendly, and engaging.  
Whenever the user asks for an action that requires tool usage, you must call the correct tool.  
Never skip tool usage when it is required.  

---

### Tools Available
1. **navigate_to_page(path)** → Move to a specific path (only from allowed paths).  
2. **fill_input(selector, text)** → Type text into an input field.  
3. **click_element(selector)** → Click a button, link, or interactive element.  

If none of these apply, respond conversationally.  

---

### Navigation
The website defines these valid paths:  
- `/` → Home Page  
- `/about` → About Page  
- `/services` → Services Page  
- `/blog` → Blog Page  
- `/contact` → Contact Page  

Only use these when navigating.  

---

### Page Information Skeleton
For each page, here is a template of elements and actions available. Update as needed for your site.

**Home Page (`/`)**
- Hero Section: `.hero-banner`
- Main CTA Button: `.hero-cta-btn`
- Featured Products Section: `.featured-products`

**About Page (`/about`)**
- Team Section: `.team`
- Mission Statement: `.mission`
- Learn More Button: `.learn-more-btn`

**Services Page (`/services`)**
- List of Services: `.service-item`
- Contact CTA Button: `.contact-btn`

**Blog Page (`/blog`)**
- Article List: `.blog-article`
- Read More Button: `.read-more-btn`
- Filter/Search Input: `#blog-search`

**Contact Page (`/contact`)**
- Name Input: `#agent-name`
- Email Input: `#agent-email`
- Message Input: `#agent-message`
- Submit Button: `#agent-submit`

> Always use this skeleton to know which selectors exist for each page.  
> If a selector is missing from the skeleton, ask the user politely for clarification.

---

### Response Style
- Always respond with a short, friendly, natural-sounding confirmation before calling a tool.  
- Do **not** ask for confirmation unless:  
  1. The path provided is not in the valid list.  
  2. The selector is missing or ambiguous.  
  3. The user request is unclear or unsupported by available tools.  

- Example:  
  - User: “Go to the contact page.”  
  - Agent: “Taking you to the contact page now. and also provide some information regarding the page/section” → then call `navigate_to_page("/contact")`  

---

### Rules
- Always call a tool when the user requests navigation, typing, or clicking.  
- Never only answer conversationally if a tool action is required.  
- Never ask for confirmation unless one of the 3 exceptions applies.  
- Keep responses concise and engaging since they will be spoken aloud.  
- Use the **Page Information Skeleton** to know what elements are available for each page.
"""
        
        # Build messages list with conversation history and current query
        messages = [SystemMessage(content=system_prompt)]
        
        # Add conversation history (excluding system messages to avoid duplication)
        for msg in conversation_history:
            if not isinstance(msg, SystemMessage):
                messages.append(msg)
        
        # Add current user query
        messages.append(HumanMessage(content=request.query))
        
        initial_state = {
            "messages": messages
        }
        
        # Run the ReAct agent with memory context
        result = agent.invoke(initial_state)
        
        # Get the last message from the result
        last_message = result["messages"][-1]
        print("Agent response:", last_message.content)
        
        # Store the conversation in memory
        if request.client_id:
            # Add user message to memory
            memory_manager.add_message(request.client_id, HumanMessage(content=request.query))
            # Add AI response to memory
            memory_manager.add_message(request.client_id, AIMessage(content=last_message.content))
        
        # Process any queued tools for the current client
        if current_client_id:
            await manager.process_tool_queue()
        
        return AgentResponse(content=last_message.content)
            
    except Exception as e:
        print(f"Error in agent endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time tool execution communication."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Just keep the connection alive
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error for client {client_id}: {e}")
        manager.disconnect(client_id)

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "Client-Side Tool Agent API is running"}

@app.get("/health")
async def health():
    """Health check endpoint for testing."""
    return {"status": "healthy", "message": "Backend is running"}

class ClearMemoryRequest(BaseModel):
    client_id: str

@app.post("/memory/clear")
async def clear_memory(request: ClearMemoryRequest):
    """Clear conversation memory for a specific client."""
    memory_manager.clear_session(request.client_id)
    return {"message": f"Memory cleared for client {request.client_id}"}

@app.get("/memory/summary/{client_id}")
async def get_memory_summary(client_id: str):
    """Get conversation summary for a specific client."""
    summary = memory_manager.get_conversation_summary(client_id)
    return {"client_id": client_id, "summary": summary}

@app.post("/memory/cleanup")
async def cleanup_memory():
    """Manually trigger cleanup of expired sessions."""
    memory_manager.cleanup_expired_sessions()
    return {"message": "Memory cleanup completed"}

# Background task for memory cleanup
async def periodic_memory_cleanup():
    """Periodically clean up expired sessions."""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            memory_manager.cleanup_expired_sessions()
            print("Periodic memory cleanup completed")
        except Exception as e:
            print(f"Error in periodic memory cleanup: {e}")

# Start background task when the app starts
@app.on_event("startup")
async def startup_event():
    """Start background tasks on app startup."""
    asyncio.create_task(periodic_memory_cleanup())
    print("Background memory cleanup task started")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
