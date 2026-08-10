import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/server/api-helpers';

/**
 * ONE-TIME RESET: Deletes all admin profiles and auth users so bootstrap can be re-run.
 * Requires X-Bootstrap-Token header (same as bootstrap).
 * This endpoint will be removed after use.
 */
export async function POST(request: NextRequest) {
  try {
    const bootstrapToken = process.env.BOOTSTRAP_TOKEN || '';
    const isProduction = process.env.COZE_PROJECT_ENV === 'PROD';

    if (isProduction && !bootstrapToken) {
      return errorResponse(new Error('Bootstrap token not configured'), 'reset-bootstrap');
    }

    const providedToken = request.headers.get('X-Bootstrap-Token') || '';
    if (bootstrapToken && providedToken !== bootstrapToken) {
      return errorResponse(new Error('Invalid bootstrap token'), 'reset-bootstrap');
    }

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    // Get all admin profiles
    const { data: admins, error: fetchError } = await supabase
      .from('profiles')
      .select('id, user_id, email, role')
      .eq('role', 'admin');

    if (fetchError) {
      return errorResponse(fetchError, 'reset-bootstrap');
    }

    if (!admins || admins.length === 0) {
      return successResponse({ message: '没有找到管理员账号，无需重置' }, 'reset-bootstrap');
    }

    const deletedUsers: string[] = [];

    for (const admin of admins) {
      // Delete user_quotas
      await supabase.from('user_quotas').delete().eq('user_id', admin.user_id);

      // Delete generation_tasks
      await supabase.from('generation_tasks').delete().eq('user_id', admin.user_id);

      // Delete profile
      const { error: profileDelError } = await supabase.from('profiles').delete().eq('id', admin.id);
      if (profileDelError) {
        console.error('Failed to delete profile:', profileDelError);
      }

      // Delete auth user via admin API
      const { error: authDelError } = await supabase.auth.admin.deleteUser(admin.user_id);
      if (authDelError) {
        console.error('Failed to delete auth user:', authDelError);
      }

      deletedUsers.push(admin.email);
    }

    return successResponse({
      message: '管理员账号已重置，可以重新执行 bootstrap',
      deleted_users: deletedUsers,
    }, 'reset-bootstrap');
  } catch (err) {
    return errorResponse(err, 'reset-bootstrap');
  }
}
