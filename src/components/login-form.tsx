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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="mr-2 size-4"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
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