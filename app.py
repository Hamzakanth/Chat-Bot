import os
from flask import Flask, request, Response, jsonify, render_template, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_classic.memory import ConversationBufferWindowMemory

load_dotenv()

app = Flask(__name__)
CORS(app)

# Helper: check for likely provider API keys (only presence, not values)
def _find_api_key():
    candidates = [
        "GROQ_API_KEY",
        "GROQ_API_TOKEN",
        "GROQ_KEY",
        "GROQ_SECRET",
        "API_KEY",
        "OPENAI_API_KEY",
    ]
    for name in candidates:
        if os.getenv(name):
            return name
    return None

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
        # Quick sanity check: ensure an API key for the LLM provider is present
        key_name = _find_api_key()
        if not key_name:
            return jsonify({"error": "Missing provider API key. Create a .env and set GROQ_API_KEY (or GROQ_API_TOKEN)."}), 500
        # Log masked key info for debugging (do not print full key)
        key_val = os.getenv(key_name)
        if key_val:
            try:
                masked = key_val[:4] + '*'*(max(0, len(key_val)-8)) + key_val[-4:]
            except Exception:
                masked = '***'
            app.logger.info(f"Using provider key from {key_name}: length={len(key_val)} masked={masked}")
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Invalid request"}), 400
            
        user_message = data["message"]
        
        @stream_with_context
        def generate():
            history = memory.load_memory_variables({})["history"]
            response_content = ""
            try:
                for chunk in chain.stream({"input": user_message, "history": history}):
                    if chunk.content:
                        yield chunk.content
                        response_content += chunk.content
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"[ERROR] {e}"
            finally:
                try:
                    memory.save_context({"input": user_message}, {"output": response_content})
                except Exception:
                    pass

        resp = Response(stream_with_context(generate()), mimetype="text/plain")
        resp.headers["X-Accel-Buffering"] = "no"
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["Transfer-Encoding"] = "chunked"
        return resp
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
