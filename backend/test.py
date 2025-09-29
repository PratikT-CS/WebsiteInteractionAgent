from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage
from langchain.tools import tool

# Define your tools
@tool
def navigate_to_page(url: str) -> str:
    """Navigate to a specific URL or path"""
    return f"Navigated to {url} successfully"

@tool
def fill_input(selector: str, value: str) -> str:
    """Fill an input field. Args: selector (CSS selector), value (text to enter)"""
    return f"Filled {selector} with '{value}'"

@tool
def click_element(selector: str) -> str:
    """Click an element. Args: selector (CSS selector)"""
    return f"Clicked {selector}. Action completed successfully."

@tool
def wait_for_element(selector: str, timeout: int = 10) -> str:
    """Wait for an element to appear. Args: selector (CSS selector), timeout (seconds)"""
    return f"Element {selector} is ready"

tools = [navigate_to_page, fill_input, click_element, wait_for_element]

# ✅ CORRECT - Use ChatPromptTemplate with MessagesPlaceholder
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a Website Interaction Agent that completes user requests by interacting with web pages.

### CRITICAL RULES
1. ALWAYS complete the user's ENTIRE request - never stop midway
2. Execute ALL necessary steps in sequence until the task is 100% done
3. For form submissions: fill ALL fields AND click submit - this is ONE complete task
4. Only use "Final Answer" after ALL steps are complete and verified

### Available Tools
{tools}

Tool names: {tool_names}

### Execution Format
Use this EXACT format:

Thought: [Analyze what needs to be done next]
Action: [tool name]
Action Input: [tool input]
Observation: [will be provided]
... (repeat until task complete)
Thought: I have completed all steps
Final Answer: [summary]

### Contact Form Workflow
When filling and submitting a contact form, you MUST do ALL these steps:
1. Navigate to contact page
2. Fill name field
3. Fill email field
4. Fill message field
5. Wait for submit button
6. Click submit button
7. Verify success
8. Only then give Final Answer

### Example
User: Fill contact form with John Doe, john@example.com, "Hello"

Thought: I need to navigate to the contact page first
Action: navigate_to_page
Action Input: /contact
Observation: Navigated to /contact successfully

Thought: Now I'll fill the name field
Action: fill_input
Action Input: {{"selector": "#agent-name", "value": "John Doe"}}
Observation: Filled #agent-name with 'John Doe'

Thought: Next, fill the email field
Action: fill_input
Action Input: {{"selector": "#agent-email", "value": "john@example.com"}}
Observation: Filled #agent-email with 'john@example.com'

Thought: Now fill the message field
Action: fill_input
Action Input: {{"selector": "#agent-message", "value": "Hello"}}
Observation: Filled #agent-message with 'Hello'

Thought: Wait for submit button to be ready
Action: wait_for_element
Action Input: #agent-submit
Observation: Element #agent-submit is ready

Thought: Click submit to complete the form submission
Action: click_element
Action Input: #agent-submit
Observation: Clicked #agent-submit. Action completed successfully.

Thought: I have completed all steps - form is filled and submitted
Final Answer: Successfully filled and submitted the contact form with John Doe, john@example.com, and message "Hello"."""),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad")
])

# Create the agent
llm = ChatOpenAI(model="gpt-4", temperature=0)

agent = create_react_agent(
    llm=llm,
    tools=tools,
    prompt=prompt
)

# Create executor
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    max_iterations=30,
    max_execution_time=120,
    verbose=True,
    handle_parsing_errors=True,
    early_stopping_method="generate"
)

# Use it
result = agent_executor.invoke({
    "input": "Fill the contact form with John Doe, johndoe@gmail.com, and a message, then submit it"
})

print(result['output'])