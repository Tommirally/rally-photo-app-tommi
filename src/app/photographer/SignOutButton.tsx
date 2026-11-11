export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="link-button">Sign out</button>
    </form>
  );
}
