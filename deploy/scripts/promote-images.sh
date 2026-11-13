#!/bin/sh
# Points a channel tag at images already published: promote-images.sh CHANNEL COMPONENT=REF...
#
# REF is a tag (0.21.0, main-1a2b3c4) or a digest (sha256:…) of IMAGE_PREFIX-COMPONENT.
# Prints COMPONENT=DIGEST for each image, so that a later promotion can point at
# exactly these images whatever the tags have become since.
set -eu

channel=${1:?usage: promote-images.sh CHANNEL COMPONENT=REF...}
shift
prefix=${IMAGE_PREFIX:?IMAGE_PREFIX names the images, such as ghcr.io/owner/repo}
prefix=$(printf '%s' "$prefix" | tr '[:upper:]' '[:lower:]')

digest_of() {
    docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}'
}

for pair in "$@"; do
    component=${pair%%=*}
    ref=${pair#*=}
    image="$prefix-$component"
    case $ref in
        sha256:*) source="$image@$ref" ;;
        *) source="$image:$ref" ;;
    esac

    digest=$(digest_of "$source")
    # A single source is copied as it is: the channel names the very image tested.
    docker buildx imagetools create --tag "$image:$channel" "$image@$digest" >&2
    if [ "$(digest_of "$image:$channel")" != "$digest" ]; then
        echo "$image:$channel does not point at $digest" >&2
        exit 1
    fi
    echo "$component=$digest"
done
