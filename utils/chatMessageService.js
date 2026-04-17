import { supabase } from './supabase.js';

/**
 * Supabase chatMessageService.js
 * ---------------------------------------------------------------
 * Uses the Supabase JS client to insert messages into a Supabase
 * hosted PostgreSQL database instead of a local pgAdmin setup.
 */

// 1.  SAVE A CHAT MESSAGE TO SUPABASE
export async function saveMessage(chatId, senderId, content) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([
        { 
          chat_id: chatId, 
          sender_id: senderId, 
          content: content, 
          status: 'sent' 
        }
      ])
      .select();

    if (error) {
      console.error('[Supabase ERROR] Failed to save message:', error.message);
      // We don't throw here to prevent crashing the server, we just log it 
      // since MongoDB acts as our primary database for the chat.
      return null;
    }

    console.log('[Supabase] Successfully saved message to Supabase DB:', data[0].id);
    return data[0];
  } catch (err) {
    console.error('[Supabase CATCH ERROR]:', err);
    throw err;
  }
}

// 2. GET MESSAGES FROM SUPABASE
export async function getMessages(chatId) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Supabase ERROR] Failed to fetch messages:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Supabase CATCH ERROR]:', err);
    return [];
  }
}

// 3. MARK MESSAGES AS READ IN SUPABASE
export async function markMessagesRead(chatId, readerId) {
  try {
    const { error } = await supabase
      .from('chat_messages')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .neq('sender_id', readerId)
      .neq('status', 'read');

    if (error) {
      console.error('[Supabase ERROR] Failed to mark messages read:', error.message);
    }
  } catch (err) {
    console.error('[Supabase CATCH ERROR]:', err);
  }
}
