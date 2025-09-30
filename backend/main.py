from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field   
from typing import Dict, Any, Union, Optional, List
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.managed import IsLastStep, RemainingSteps
import json
import dotenv
import asyncio
import uuid
from datetime import datetime

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
    """Process a query through the LangGraph ReAct agent."""
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
        
        # Create initial state with the user's query
        prompt = f"""You are a Website Interaction Agent that completes user requests by interacting with web pages.

### CRITICAL RULES
1. ALWAYS complete the user's ENTIRE request - never stop midway
2. Execute ALL necessary steps parallelly until you fill this steps need sequencial execution.
3. For form submissions: fill ALL fields AND click submit - this is ONE complete task
4. Only use "Final Answer" after ALL steps are complete and verified

### Contact Form Workflow
When filling and submitting a contact form, you MUST do ALL these steps:
1. Navigate to contact page (/contact)
2. Fill name field (#agent-name)
3. Fill email field (#agent-email)
4. Fill message field (#agent-message)
5. Wait for submit button (#agent-submit)
6. Click submit button
7. Verify success
8. Only then respond with completion message
If any field is not provide by user ask for it and then fill it and then submit the form.

### Example Workflow
User: "Fill contact form with John Doe, john@example.com, 'Hello'"

Step 1: Call navigate_to_page with "/contact"
Step 2: Call fill_input with selector="#agent-name", value="John Doe"
Step 3: Call fill_input with selector="#agent-email", value="john@example.com"
Step 4: Call fill_input with selector="#agent-message", value="Hello"
Step 5: Call wait_for_element with "#agent-submit"
Step 6: Call click_element with "#agent-submit"
Step 7: Final Response with tool execution summary

IMPORTANT: Do not stop until ALL steps are complete!
User query: {request.query}
"""
        
        initial_state = {
            "messages": [HumanMessage(content=prompt)]
        }
        
        # Run the ReAct agent with recursion limit
        result = agent.invoke(initial_state)
        
        # Get the last message from the result
        last_message = result["messages"][-1]
        print("Agent response:", last_message.content)
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
