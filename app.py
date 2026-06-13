import os
from flask import Flask, request, Response, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_classic.memory import ConversationBufferWindowMemory

load_dotenv()

app = Flask(__name__)
CORS(app)

memory = ConversationBufferWindowMemory(k=10, return_messages=True)
llm = ChatGroq(model_name="llama-3.1-8b-instant", streaming=True)

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI assistant."),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}")
])

chain = prompt | llm

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Invalid request"}), 400
            
        user_message = data["message"]
        
        def generate():
            history = memory.load_memory_variables({})["history"]
            response_content = ""
            for chunk in chain.stream({"input": user_message, "history": history}):
                if chunk.content:
                    yield chunk.content
                    response_content += chunk.content
            memory.save_context({"input": user_message}, {"output": response_content})
            
        return Response(generate(), mimetype="text/plain")
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
