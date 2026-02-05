import React, {
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import axios from "axios";


const HRChat = forwardRef((props, ref) => {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  const sessionId = useRef(Math.random().toString(36).slice(2));

  const initialOptions = [
    "What is our leave policy?",
    "Show upcoming holidays.",
    "Apply sick leave for tomorrow.",
    "What benefits does the company provide?",
  ];

  useImperativeHandle(ref, () => ({
    ask: (prompt) => sendMessage(prompt),
  }));

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setUserInput(transcript);
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    listening ? recognitionRef.current.stop() : recognitionRef.current.start();
  };

  const sendMessage = async (message) => {
    if (!message.trim()) return;

    setMessages((prev) => [...prev, { from: "user", text: message }]);
    setUserInput("");
    setLoading(true);

    try {
      const res = await axios.post(
        "https://pluang-7edp.vercel.app/api/hrbot",
        {
          message,
          sessionId: sessionId.current,
        },
      );

      const { response } = res.data;
      setMessages((prev) => [...prev, { from: "ai", text: response }]);
    } catch (err) {
      console.error("AI Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          from: "ai",
          text: "⚠️ Sorry, something went wrong. Try again later.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(userInput);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white shadow-xl rounded-xl p-6 space-y-6 border border-gray-200">
        <h1 className="text-2xl font-bold text-center text-blue-700">
          HR Buddy 🤖
        </h1>

     
        {messages.length === 0 && (
          <div className="space-y-4 text-center">
            <p className="font-semibold text-gray-700">
              Hi there! I'm your HR Assistant. How can I help today?
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {initialOptions.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(opt)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-all duration-200 text-sm"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.from === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`rounded-lg p-3 text-sm shadow-sm max-w-[75%] whitespace-pre-wrap ${
                  msg.from === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="text-gray-500 text-sm animate-pulse">
              HR Buddy is typing...
            </div>
          )}

          <div ref={chatEndRef}></div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex gap-3 border-t pt-3 border-gray-200"
        >
          <input
            type="text"
            className="flex-1 border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Ask HR Buddy anything..."
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            onClick={toggleListening}
            className={`px-4 py-2 rounded-md border transition ${
              listening
                ? "bg-red-600 text-white"
                : "bg-white border-blue-400 text-blue-600"
            }`}
            disabled={loading}
            title={listening ? "Stop Listening" : "Start Voice Input"}
          >
            🎤
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
});

export default HRChat;
