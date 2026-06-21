import { createAdminClient } from '@/lib/supabase/admin';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getRefreshTokenExpiry } from './jwt';

export function generateRefreshToken(): string {
  return randomBytes(40).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(params: {
  userId: string;
  tokenHash: string;
  familyId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('refresh_tokens').insert({
    user_id: params.userId,
    token_hash: params.tokenHash,
    family_id: params.familyId,
    expires_at: getRefreshTokenExpiry().toISOString(),
  });

  if (error) throw new Error(`Failed to store refresh token: ${error.message}`);
}

export async function createTokenFamily(userId: string): Promise<{
  refreshToken: string;
  familyId: string;
}> {
  const refreshToken = generateRefreshToken();
  const familyId = uuidv4();
  const tokenHash = hashToken(refreshToken);

  await storeRefreshToken({ userId, tokenHash, familyId });

  return { refreshToken, familyId };
}

interface RotationResult {
  valid: true;
  newRefreshToken: string;
  userId: string;
  familyId: string;
}

interface RotationError {
  valid: false;
  reason: 'invalid' | 'expired' | 'revoked_reuse_detected';
}

export async function rotateRefreshToken(
  presentedToken: string,
): Promise<RotationResult | RotationError> {
  const supabase = createAdminClient();
  const tokenHash = hashToken(presentedToken);

  const { data: existing, error: fetchError } = await supabase
    .from('refresh_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .single();

  if (fetchError || !existing) {
    return { valid: false, reason: 'invalid' };
  }

  if (existing.revoked) {
    await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('family_id', existing.family_id);

    return { valid: false, reason: 'revoked_reuse_detected' };
  }

  if (new Date(existing.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('id', existing.id);

  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRefreshToken);

  await storeRefreshToken({
    userId: existing.user_id,
    tokenHash: newTokenHash,
    familyId: existing.family_id,
  });

  return {
    valid: true,
    newRefreshToken,
    userId: existing.user_id,
    familyId: existing.family_id,
  };
}

export async function revokeFamily(familyId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('family_id', familyId);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('user_id', userId);
}
