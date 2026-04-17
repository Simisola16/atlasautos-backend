import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing from .env file');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Uploads a file to Supabase Storage
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} fileName - The name of the file
 * @param {string} bucket - The bucket name (default: 'atlasautos')
 * @param {string} mimetype - The MIME type of the file
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
export const uploadToSupabase = async (fileBuffer, fileName, bucket = 'atlasautos', mimetype = 'image/jpeg') => {
  try {
    const timestamp = Date.now();
    const cleanFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const filePath = `${timestamp}_${cleanFileName}`;

    let { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: mimetype,
        upsert: true
      });

    // If bucket not found, try to create it and re-upload (requires appropriate key permissions)
    if (error && error.message === 'Bucket not found') {
      console.log(`Bucket "${bucket}" not found. Attempting to create it...`);
      const { error: createError } = await supabase.storage.createBucket(bucket, {
        public: true
      });
      
      if (!createError) {
        // Retry upload
        const retry = await supabase.storage
          .from(bucket)
          .upload(filePath, fileBuffer, {
            contentType: mimetype,
            upsert: true
          });
        data = retry.data;
        error = retry.error;
      } else {
        console.error(`Failed to create bucket "${bucket}":`, createError);
      }
    }

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Supabase Upload Error:', error);
    throw new Error('Failed to upload image to Supabase');
  }
};
