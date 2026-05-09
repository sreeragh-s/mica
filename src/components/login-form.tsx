"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field"
import { HugeiconsIcon } from "@hugeicons/react"
import { LayoutBottomIcon } from "@hugeicons/core-free-icons"
import { signInWithGitHub, createGuestSession } from "@/lib/auth-client"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isSigningIn, setIsSigningIn] = React.useState(false)
  const [signInError, setSignInError] = React.useState<string | null>(null)

  const handleGitHubSignIn = async () => {
    setSignInError(null)
    setIsSigningIn(true)
    try {
      await signInWithGitHub()
    } catch (error) {
      console.error("Failed to sign in with GitHub:", error)
      setSignInError(
        error instanceof Error ? error.message : "Could not start GitHub sign-in.",
      )
      setIsSigningIn(false)
    }
  }

  const handleGuestContinue = () => {
    createGuestSession()
    window.location.reload()
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="#"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-8 items-center justify-center rounded-md">
                <HugeiconsIcon icon={LayoutBottomIcon} strokeWidth={2} className="size-6" />
              </div>
              <span className="sr-only">Mica</span>
            </a>
            <h1 className="text-xl font-bold">Welcome to Mica</h1>
            <FieldDescription>
              Sign in to your account or continue as a guest
            </FieldDescription>
          </div>
          <Field className="grid gap-4">
            <Button
              type="button"
              onClick={handleGitHubSignIn}
              disabled={isSigningIn}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="mr-2 size-4">
                <path
                  d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                  fill="currentColor"
                />
              </svg>
              {isSigningIn ? "Opening GitHub…" : "Continue with GitHub"}
            </Button>
            {signInError ? (
              <p className="text-center text-sm text-destructive" role="alert">
                {signInError}
              </p>
            ) : null}
            <Button variant="ghost" type="button" onClick={handleGuestContinue}>
              Continue as Guest
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}