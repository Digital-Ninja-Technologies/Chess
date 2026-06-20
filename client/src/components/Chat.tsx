import { useState, useEffect, useRef } from 'react';
import { ChatMessage, Color } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myColor: Color;
}

export default function Chat({ messages, onSend, myColor }: ChatProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  };

  return (
    <div className="chat-panel">
      <div className="panel-title">Chat</div>
      <div className="chat-messages">
        {messages.length === 0 && <p className="no-messages">Say something…</p>}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`chat-msg ${msg.color === myColor ? 'mine' : 'theirs'}`}
          >
            <span className="chat-sender">{msg.playerName}</span>
            <span className="chat-text">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="chat-input"
          maxLength={200}
        />
        <button onClick={handleSend} className="send-btn">Send</button>
      </div>
    </div>
  );
}
